package com.kinto.trendyollab;
public class WebViewGuardCheck {public static void main(String[] args){
 if(!WebViewUpdateGuard.obsolete("74.0.3729.185")||WebViewUpdateGuard.obsolete("80.0.0")||WebViewUpdateGuard.obsolete("155.0.0")||WebViewUpdateGuard.obsolete(null)||WebViewUpdateGuard.obsolete("OEM-custom"))throw new AssertionError();
 System.out.println("PASS_WEBVIEW_GUARD_VERSION_BOUNDARY");}}
