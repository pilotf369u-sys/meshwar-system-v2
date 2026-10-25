package com.kinto.trendyollab;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.webkit.WebView;
/** Reject only engines known not to parse KINTO's existing optional-chaining syntax. */
final class WebViewUpdateGuard {
 static boolean obsolete(String version){
  if(version==null||!version.matches("[0-9]+\\..*"))return false;
  try{return Integer.parseInt(version.substring(0,version.indexOf('.')))<80;}catch(NumberFormatException e){return false;}
 }
 static boolean showIfRequired(Activity activity){
  PackageInfo provider=WebView.getCurrentWebViewPackage();
  if(provider==null||!obsolete(provider.versionName))return false;
  String pkg="com.android.chrome".equals(provider.packageName)?"com.android.chrome":"com.google.android.webview";
  new AlertDialog.Builder(activity).setTitle("يلزم تحديث عارض الصفحات")
   .setMessage("حدّث Android System WebView أو Chrome من متجر جهازك ثم افتح KINTO مجدداً، حتى تظهر الصفحات والفواتير بصورة صحيحة. بيانات حسابك وطلباتك تبقى محفوظة.")
   .setCancelable(false).setPositiveButton("فتح صفحة التحديث",(d,w)->{try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id="+pkg)));}catch(Exception ignored){}activity.finish();})
   .setNegativeButton("إغلاق التطبيق",(d,w)->activity.finish()).show();
  return true;
 }
 private WebViewUpdateGuard(){}
}
