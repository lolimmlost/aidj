#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// ObjC bridge: registers the Swift NativeAudioPlugin + its methods with
// Capacitor's runtime so registerPlugin('NativeAudio') resolves on iOS.
// Drop this next to NativeAudioPlugin.swift in the App target.
CAP_PLUGIN(NativeAudioPlugin, "NativeAudio",
    CAP_PLUGIN_METHOD(prepare, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(play, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(pause, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(resume, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(seek, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(crossfadeTo, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setQueue, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getState, CAPPluginReturnPromise);
)
