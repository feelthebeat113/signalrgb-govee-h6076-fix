import udp from "@SignalRGB/udp";
import goveeProducts from "./govee-products.test.js";
import GoveeDevice from "./GoveeDevice.test.js";
import GoveeController from "./GoveeController.test.js";
import GoveeDeviceUI from "./GoveeDeviceUI.test.js";

export function Name() { return "Govee Direct Connect (H6076 Fix)"; }
export function Version() { return "2.2.0"; }
export function Type() { return "network"; }
export function Publisher() { return "RickOfficial"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() {return [0, 70]; }
export function DefaultScale(){return 1.0;}
export function DefaultComponentBrand() { return "Govee";}
export function ControllableParameters()
{
	return [
		{"property":"lightingMode", "group":"lighting", "label":"Lighting Mode", "type":"combobox", "values":["Canvas", "Forced", "Test Pattern"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
		{"property":"turnOff", "group":"lighting", "label":"On shutdown", "type":"combobox", "values":["Release control", "Single color", "Turn device off"], "default":"Turn device off"},
        {"property":"shutDownColor", "group":"lighting", "label":"Shutdown Color", "min":"0", "max":"360", "type":"color", "default":"#8000FF"},
        {"property":"frameDelay", "group":"settings", "label":"Delay between frames", "type":"combobox", "values":["0", "10", "50", "100"], "default":"0"}
	];
}

export function SubdeviceController() { return false; }

let goveeUI;
let lastRender = 0;

export function Initialize()
{
    device.log('Creating Govee Device UI');
	goveeUI = new GoveeDeviceUI(device, controller);
}

export function Render()
{
    let now = Date.now();
    goveeUI.render(lightingMode, forcedColor, now, frameDelay);
}

export function Shutdown(SystemSuspending)
{
    device.log('Shutting down');
    goveeUI.shutDown(turnOff, shutDownColor);
}

export function Validate()
{
    return true;
}

export function DiscoveryService()
{
    service.log("You're running version " + Version());
    this.IconUrl = getGoveeLogo();

    this.lastPollTime = -5000;
    this.PollInterval = 5000;

    this.lastPort = null;
    
    // Disabled so we don't use the built in broadcasting
    // this.UdpBroadcastPort = 4003;
    // this.UdpListenPort = 4002;

    this.discoveredDeviceData = {};
    this.GoveeDeviceControllers = {};

    this.Initialize = function() {
        this.lastPort = service.getSetting('ipCache', 'lastUniquePort');
        if (!this.lastPort) this.getUniquePort();

        this.lastPollTime = Date.now();
        this.devicesLoaded = false;

        // --- Auto-discovery (tu quet IP theo Govee scan, khong can nhap IP tay) ---
        this.lastScanTime = 0;
        this.scanInterval = 20000; // quet lai moi 20s de bat IP doi do DHCP

        this.startSocketServer();

        // Nap cac den da luu roi quet ngay khi mo (de bat duoc IP da doi luc dang tat app)
        this.loadForcedDevices();
        this.autoScan();
	}

    this.startSocketServer = function()
    {
        // Start the udp server
        if (!this.udpServer)
        {
            this.udpServer = udp.createSocket();
            this.udpServer.on('message', this.handleSocketMessage.bind(this));
            this.udpServer.on('error', this.handleSocketError.bind(this));
            service.log('Trying to bind UDP port 4002');
            this.udpServer.bind(4002);
        }
    }

    this.forceDiscover = function(ip, leds, type, split)
    {
        let goveeLightData = { 
            ip: ip,
            leds: parseInt(leds),
            type: parseInt(type),
            split: split,
            uniquePort: this.getUniquePort()
        };

        this.GoveeDeviceControllers[ip] = this.createController(goveeLightData);

        this.saveCache();
        this.Update(true);
    }

    this.loadForcedDevices = function()
    {
        // Load the cached ips
        let ipCacheJSON = service.getSetting('ipCache', 'cache');
        let ipCache = {};
        if (ipCacheJSON) ipCache = JSON.parse(ipCacheJSON);

        // Get all cached ips
        let cachedIps = Object.keys(ipCache);
        
        for(let cachedIp of cachedIps)
        {
            // If Controller is not yet created
            if (!this.GoveeDeviceControllers.hasOwnProperty(cachedIp))
            {
                // Create the controller and add it
                this.GoveeDeviceControllers[cachedIp] = this.createController(ipCache[cachedIp]);
            }

            let goveeController = this.GoveeDeviceControllers[cachedIp];
            
            if (!service.hasController(cachedIp))
            {
                service.addController(goveeController);
                // Announce the controller as a device
                service.announceController(goveeController);
            } else
            {
                service.updateController(goveeController);
            }
        }

        this.devicesLoaded = true;
    }

    this.Update = function(force)
    {
        let diff = Date.now() - discovery.lastPollTime;

        if(diff > discovery.PollInterval || force === true)
        {
			discovery.lastPollTime = Date.now();

            if (!this.devicesLoaded || force === true)
            {
                this.loadForcedDevices();
            }

            // Quet dinh ky de tu cap nhat IP khi DHCP doi
            this.autoScan();
		}
    }

    this.handleSocketError = function(err, message)
    {
        service.log(message);
    }

    this.handleSocketMessage = function(value)
    {
        if (!value) return;
        const ip = this.getIPv4(value.address);

        // Auto-discovery: soi scan reply de tu cap nhat IP. Bao try/catch de KHONG
        // bao gio lam hong luong relay mau dang chay.
        try {
            let parsed = JSON.parse(value.data);
            if (parsed && parsed.msg && parsed.msg.cmd === 'scan' && parsed.msg.data) {
                this.onScanReply(ip, parsed.msg.data);
            }
        } catch (e) {}

        if (this.GoveeDeviceControllers.hasOwnProperty(ip))
        {
            let goveeController = this.GoveeDeviceControllers[ip];
            goveeController.relaySocketMessage(value, this);
        }
        // IP la chua co controller: co the la den vua doi IP -> onScanReply da xu ly.
        // Khong log spam vi quet ca subnet se nhan nhieu reply tu IP khong lien quan.
	};

    this.getIPv4 = function(address)
    {
        const ipv4Pattern = /(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)\.(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)\.(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)\.(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)/;
        const match = address.match(ipv4Pattern);
        return match ? match[0] : null;
    }

    this.Delete = function(ip)
    {
        service.log('Deleting controller ' + ip);
        this.removeController(ip);
        this.saveCache();
        this.Update(true);
    }

    this.changeIp = function(oldIp, newIp)
    {
        if (this.GoveeDeviceControllers.hasOwnProperty(oldIp))
        {
            this.GoveeDeviceControllers[newIp] = this.GoveeDeviceControllers[oldIp];
            this.Delete(oldIp);
        }
    }

    this.saveCache = function()
    {
        let ipCache = {};
        for(let ip of Object.keys(this.GoveeDeviceControllers))
        {
            let goveeController = this.GoveeDeviceControllers[ip];
            ipCache[goveeController.id] = goveeController.toCacheJSON();
        }

        service.saveSetting('ipCache', 'cache', JSON.stringify(ipCache));
    }

    this.removeController = function(ip)
    {
        let goveeController = this.GoveeDeviceControllers[ip];
        service.removeController(goveeController);
        delete this.GoveeDeviceControllers[ip];
    }

    this.getUniquePort = function()
    {
        
        if (!this.lastPort || this.lastPort < 46920)
        {
            this.lastPort = 46920;
        } else
        {
            this.lastPort++;
        }

        service.log('Assigning unique port ' + this.lastPort)
        // Save the new port:
        service.saveSetting('ipCache', 'lastUniquePort', this.lastPort);
        return this.lastPort;
    }

    this.createController = function(cacheData)
    {
        service.log('Creating controller: ' + cacheData.ip);
        
        let goveeDevice;

        if (cacheData.id)
        {
            goveeDevice = (new GoveeDevice).load(cacheData.id);

            // Add this for devices with the old settings
            if (!goveeDevice.uniquePort)
            {
                goveeDevice.uniquePort = this.getUniquePort();
                goveeDevice.save();
            }
        } else
        {
            goveeDevice = new GoveeDevice(cacheData);
        }

        // Create and store controller for network tab
        let goveeController = new GoveeController(goveeDevice);

        // Start the udp socket?
        goveeController.setupUDPSocket();
        return goveeController;
    }

    this.updatedController = function(goveeController)
    {
        service.log(`Controller ${goveeController.id} data updated`);
        this.saveCache();
        service.removeController(goveeController);
        service.addController(goveeController);
        service.log('Re-announcing the controller');
        service.announceController(goveeController);

        service.log('Restart our socket server');
        this.startSocketServer();

    }

    // ===================================================================
    //  AUTO-DISCOVERY: tu quet IP theo Govee 'scan' (thay viec nhap IP tay)
    //  JS trong SignalRGB khong doc duoc bang ARP/MAC cua Windows, nen ta
    //  quet ca subnet bang lenh Govee 'scan' (unicast toi cong 4001). Den
    //  tra loi ve cong 4002 (socket nay so huu) kem device-id + sku + ip.
    //  Khop theo DEVICE-ID -> bam dung den du DHCP doi IP, khong can go tay.
    // ===================================================================
    this.autoScan = function()
    {
        let now = Date.now();
        if (!this.lastScanTime) this.lastScanTime = 0;
        if (now - this.lastScanTime < (this.scanInterval || 20000)) return;
        this.lastScanTime = now;

        let subnets = this.getScanSubnets();
        if (!subnets.length) return;

        if (!this.scanSocket)
        {
            this.scanSocket = udp.createSocket();
            this.scanSocket.on('error', function() {});
        }

        let pkt = { msg: { cmd: 'scan', data: { account_topic: 'reserve' } } };
        for (let s of subnets)
        {
            for (let i = 1; i <= 254; i++)
            {
                this.scanSocket.write(pkt, s + '.' + i, 4001);
            }
        }
        // Gui them multicast (neu router/Tailscale cho phep thi cang tot)
        try { this.scanSocket.write(pkt, '239.255.255.250', 4001); } catch (e) {}

        service.log('Auto-discovery: da quet ' + subnets.join('.0/24, ') + '.0/24');
    }

    this.getScanSubnets = function()
    {
        let subs = {};
        let add = function(ip) {
            if (!ip) return;
            let m = ('' + ip).match(/^(\d+\.\d+\.\d+)\.\d+$/);
            if (m) subs[m[1]] = true;
        };

        // Tu cac controller dang chay
        for (let ip of Object.keys(this.GoveeDeviceControllers)) add(ip);

        // Tu cache IP da luu (de biet subnet ke ca khi chua co controller)
        try {
            let cacheJSON = service.getSetting('ipCache', 'cache');
            if (cacheJSON) {
                let cache = JSON.parse(cacheJSON);
                for (let k of Object.keys(cache)) add(cache[k] && cache[k].ip);
            }
        } catch (e) {}

        // Subnet cau hinh tay (tuy chon): service setting autoscan/subnet = "192.168.100"
        let cfg = service.getSetting('autoscan', 'subnet');
        if (cfg) subs[cfg] = true;

        return Object.keys(subs);
    }

    this.onScanReply = function(srcIp, data)
    {
        let replyIp  = data.ip || srcIp;
        let deviceId = data.device;
        let sku      = data.sku;
        if (!replyIp || !deviceId) return;

        // Da co controller dung IP nay -> relay lo binh thuong, khong can lam gi
        if (this.GoveeDeviceControllers.hasOwnProperty(replyIp)) return;

        // Tim controller cua DUNG device-id nay nhung dang o IP cu (da chet)
        let stale = null;
        for (let ip of Object.keys(this.GoveeDeviceControllers))
        {
            let c = this.GoveeDeviceControllers[ip];
            if (c && c.device && c.device.id && c.device.id === deviceId)
            {
                stale = c;
                break;
            }
        }

        // Thiet bi la (chua tung them tay) -> bo qua, KHONG tu doat dieu khien
        if (!stale) return;

        // Di doi sang IP moi bang dung luong code 'them tay' (forceDiscover) da on dinh,
        // roi xoa controller o IP cu.
        let leds  = stale.device.leds;
        let type  = stale.device.type;
        let split = stale.device.split;
        service.log('Auto-discovery: ' + (sku || 'device') + ' ' + deviceId +
                    ' doi IP ' + stale.id + ' -> ' + replyIp + ', dang cap nhat controller...');
        this.forceDiscover(replyIp, leds, type, split);
        this.Delete(stale.id);
    }
}

function getGoveeLogo()
{
    return goveeProducts['default'].base64Image;
}


