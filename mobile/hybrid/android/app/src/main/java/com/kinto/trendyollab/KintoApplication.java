package com.kinto.trendyollab;
import android.app.Application;
import android.webkit.WebView;
public class KintoApplication extends Application {
 @Override public void onCreate(){super.onCreate();WebView.setDataDirectorySuffix(Application.getProcessName().endsWith(":shopping")?"external-shopping":"kinto-account");}
}
