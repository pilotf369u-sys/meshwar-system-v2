package com.kinto.trendyollab;
import android.content.Context;
import android.content.pm.ApplicationInfo;
/** Runtime gate shared by the SDK-only debug builder and Gradle release. */
final class PreviewMode {
 static boolean enabled(Context context){return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE)!=0;}
 private PreviewMode(){}
}
