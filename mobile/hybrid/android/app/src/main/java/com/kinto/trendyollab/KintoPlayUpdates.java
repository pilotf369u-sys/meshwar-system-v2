package com.kinto.trendyollab;
import android.app.*;
import android.content.*;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.play.core.install.model.AppUpdateType;

/** Opt-in Google Play flexible updates; never blocks customer sessions or web workflows. */
final class KintoPlayUpdates {
 private static final int REQUEST=2241;
 private final Activity activity;
 private final AppUpdateManager manager;
 private final InstallStateUpdatedListener listener;
 private boolean showing=false;
 private boolean checking=false;
 private long lastCheck=0L;
 KintoPlayUpdates(Activity activity){
  this.activity=activity;
  manager=AppUpdateManagerFactory.create(activity);
  listener=state->{if(state.installStatus()==InstallStatus.DOWNLOADED)ready();};
  manager.registerListener(listener);
 }
 void onResume(){
  long now=System.currentTimeMillis();
  if(checking||now-lastCheck<60000L)return;
  checking=true;lastCheck=now;
  manager.getAppUpdateInfo().addOnSuccessListener(info->{
   checking=false;
   if(activity.isFinishing()||activity.isDestroyed())return;
   if(info.installStatus()==InstallStatus.DOWNLOADED){ready();return;}
   if(info.updateAvailability()!=UpdateAvailability.UPDATE_AVAILABLE||!info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)||showing)return;
   // At most one suggestion per published version per day after a dismissal.
   String id="flexible_update_remind_"+info.availableVersionCode();
   long last=activity.getPreferences(0).getLong(id,0L);
   if(System.currentTimeMillis()-last<24L*60*60*1000)return;
   showing=true;
   new AlertDialog.Builder(activity).setTitle("تحديث جديد لتطبيق KINTO")
    .setMessage("يتوفر إصدار أحدث مع تحسينات جديدة. يمكنك تنزيله عبر Google Play والاستمرار باستخدام التطبيق أثناء التنزيل.")
    .setPositiveButton("تحديث الآن",(d,w)->{
     activity.getPreferences(0).edit().putLong(id,System.currentTimeMillis()).apply();
     try{manager.startUpdateFlowForResult(info,AppUpdateType.FLEXIBLE,activity,REQUEST);}catch(Exception ignored){}
     showing=false;
    })
    .setNegativeButton("لاحقاً",(d,w)->{activity.getPreferences(0).edit().putLong(id,System.currentTimeMillis()).apply();showing=false;})
    .setOnCancelListener(d->{activity.getPreferences(0).edit().putLong(id,System.currentTimeMillis()).apply();showing=false;})
    .show();
  }).addOnFailureListener(e->checking=false);
 }
 private void ready(){
  if(showing||activity.isFinishing()||activity.isDestroyed())return;
  showing=true;
  new AlertDialog.Builder(activity).setTitle("اكتمل تنزيل تحديث KINTO")
   .setMessage("التحديث جاهز. سيُعاد فتح التطبيق لإكمال التثبيت؛ احفظ أي طلب تعمل عليه قبل المتابعة.")
   .setPositiveButton("إعادة التشغيل والتحديث",(d,w)->{showing=false;manager.completeUpdate();})
   .setNegativeButton("لاحقاً",(d,w)->showing=false)
   .setOnCancelListener(d->showing=false).show();
 }
 void onDestroy(){manager.unregisterListener(listener);}
}
