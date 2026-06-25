# Govee Direct Connect (H6076 Fix)

> Fork of [fu-raz/signalrgb-govee-direct-connect](https://github.com/fu-raz/signalrgb-govee-direct-connect),
> patched to light the **Govee H6076 Floor Lamp 2** and to **auto-discover the lamp's IP** so you
> never have to retype it when DHCP changes it.

## What this fork changes

1. **H6076 lights up.** The original gates color frames on `id != null` and on `onOff`. The H6076
   firmware replies to LAN requests on a **fixed port 4002** regardless of the request's source port,
   so the rendering instance never receives the `onOff`/`id` it waits for, and frames are never sent.
   This fork bypasses both gates in `GoveeDevice.test.js` (`sendRGB`). Set the device **Protocol =
   "Single color"** (Dreamview/Razer per-segment is not supported on this lamp over the open LAN API).

2. **Auto-discovery by Govee `scan` (v2.2.0).** You no longer pin a static IP. The `DiscoveryService`
   now sweeps your subnet with the Govee `scan` command (unicast to `:4001`); the lamp answers on
   `:4002` (the port this plugin owns) with its **device-id + sku + current ip**. Controllers are
   matched by **device-id**, so when DHCP moves the lamp the plugin migrates the controller to the new
   IP automatically — same effect as resolving by MAC, done entirely inside the plugin sandbox (JS
   can't read the OS ARP table).
   - It scans on startup and every ~20s. Subnets are inferred from the last-known IP, so **add the
     lamp by IP once** and it auto-tracks thereafter. You can also pin a subnet via the service
     setting `autoscan/subnet` (e.g. `192.168.100`).
   - Discovery multicast is often swallowed (router not bridging it / Tailscale stealing egress), which
     is why the sweep is **unicast**; a multicast probe is still sent as a bonus.
   - Foreign Govee devices that reply to the scan are **ignored** (never auto-adopted) unless you've
     added that exact device.

## Why a separate repo

SignalRGB hard-resets and git-validates marketplace addon files on every launch, so the patch has to
live as the legit `HEAD` of an addon registered under this repo's URL. Install **this** addon and
**disable the original fu-raz one** (both bind UDP 4002 and would conflict).

## Getting started
This SignalRGB Addon allows you to add Govee devices via a direct IP connection. You control the amount of leds of the device and what protocol is used to communicate with the device. You can even use components to build your exact Govee Glide setup.

You should make sure your device is connected to your wifi via the app, you have refreshed the light segments and have turned on LAN Control. It works best if the device has an assigned IP by reserving an IP in your router.

If your device consists of multiple components like the Govee Bars, you can select 'Duplicate'. The amount of LEDS you enter should then be the amount of 1 bar. For example: The H6046 has two bars and each bar has 10 LEDs. You would then set the LED count to 10 and select 'Duplicate'. Your layout will now have one device representing both of the bars.
If you'd rather split the leds evenly over two devices, then fill in the total amount of LEDs and select 'Two devices'. Your layout will now show two devices representing each of the bars.

If you have a more complex device like the Glide (H6062), you can select 'Custom components'. This way you can make your layout exactly like you have your device on the wall. Make sure for the H6062 that you count 9 LEDs for the each straight bar and 3 LEDs for each corner. If you'd like to use the actual components for this device, they are included in this repository.

## Known Issues
- Getting the information from the device sometimes takes a while, give the bars around 30 seconds to start
- Sometimes the bars don't turn off when you shut down SignalRGB

## Installation
Click the button above and allow signalrgb to install this extension when prompted.

## Support
Feel free to open issues here, or join the SignalRGB Testing Server and post an issue there https://discord.com/invite/J5dwtcNhqC. Don't forget to tag me @rickofficial
