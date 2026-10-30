package com.kinto.trendyollab;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Native KINTO support overlay. External retailer WebViews never receive account cookies or this UI. */
public final class KintoShopSupport {
 private static final String ENDPOINT="https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/get_site_settings";
 private static final String PUBLIC_KEY="sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH";
 private static final String MESSAGE="مرحبا، أحتاج مساعدة من فريق KINTO.";
 private KintoShopSupport(){}
 private static int dp(Activity a,int value){return Math.round(value*a.getResources().getDisplayMetrics().density);}
 private static GradientDrawable round(int color,int stroke,float radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(radius);if(stroke!=0)d.setStroke(1,stroke);return d;}
 private static JSONObject settings(Object data)throws JSONException {
  if(data instanceof JSONArray){JSONArray a=(JSONArray)data;return a.length()==0?new JSONObject():settings(a.get(0));}
  if(data instanceof JSONObject){JSONObject o=(JSONObject)data;return o.has("value")?settings(o.get("value")):o;}
  if(data instanceof String)return settings(new JSONTokener((String)data).nextValue());
  return new JSONObject();
 }
 private static String validate(String raw){String n=(raw==null?"":raw).replaceAll("[^0-9]","").replaceFirst("^00","");return n.matches("[1-9][0-9]{8,14}")?n:"";}
 private static String number(JSONObject obj){
  if(!obj.optBoolean("whatsapp_active",false)&&!"true".equalsIgnoreCase(obj.optString("whatsapp_active")))return "";
  String direct=validate(obj.optString("support_phone"));if(!direct.isEmpty())return direct;
  try {
   Uri link=Uri.parse(obj.optString("whatsapp_url"));
   if(!"https".equalsIgnoreCase(link.getScheme()))return "";
   String host=link.getHost();if(host==null||!(host.equalsIgnoreCase("wa.me")||host.equalsIgnoreCase("api.whatsapp.com")||host.equalsIgnoreCase("web.whatsapp.com")))return "";
   String raw=link.getQueryParameter("phone");if(raw==null&&host.equalsIgnoreCase("wa.me"))raw=link.getLastPathSegment();
   return validate(raw);
  }catch(Exception ignored){return "";}
 }
 private static void open(Activity a,String phone,String type){
  String url="https://wa.me/"+phone+"?text="+Uri.encode(MESSAGE+"\n"+type);
  try{a.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));}
  catch(Exception e){Toast.makeText(a,"لا يوجد تطبيق لفتح واتساب",Toast.LENGTH_LONG).show();}
 }
 private static void dialog(Activity a,String phone){
  String[] labels={"❔ سؤال عام بخصوص المنصة","🏬 طلب من متجر محلي","🌍 طلب من متجر عالمي"};
  String[] messages={"🟢 استفسار عام عن المنصة","🏬 الطلبات المحلية","🌍 الطلبات العالمية"};
  new AlertDialog.Builder(a).setTitle("مرحباً، كيف يمكننا مساعدتك؟")
   .setItems(labels,(d,which)->open(a,phone,messages[which])).setNegativeButton("إغلاق",null).show();
 }
 public static void install(Activity a,LinearLayout content){
  FrameLayout outer=new FrameLayout(a);outer.addView(content,new FrameLayout.LayoutParams(-1,-1));a.setContentView(outer);
  TextView fab=new TextView(a);fab.setText("☎");fab.setTextSize(23);fab.setTypeface(null,Typeface.BOLD);fab.setTextColor(Color.WHITE);fab.setGravity(Gravity.CENTER);
  fab.setContentDescription("مساعدة KINTO عبر واتساب");
  fab.setBackground(round(Color.rgb(37,211,102),Color.rgb(218,191,118),dp(a,24)));
  fab.setElevation(dp(a,6));fab.setVisibility(View.GONE);
  FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(dp(a,44),dp(a,44),Gravity.BOTTOM|Gravity.LEFT);
  params.setMargins(dp(a,12),0,0,dp(a,81));outer.addView(fab,params);
  final String[] phone={""};
  fab.setOnClickListener(v->{if(!phone[0].isEmpty())dialog(a,phone[0]);});
  final float[] down=new float[2];final boolean[] dragging={false};final float[] origin=new float[2];
  fab.setOnTouchListener((v,event)->{
   switch(event.getActionMasked()){
    case MotionEvent.ACTION_DOWN: down[0]=event.getRawX();down[1]=event.getRawY();origin[0]=v.getX();origin[1]=v.getY();dragging[0]=false;return true;
    case MotionEvent.ACTION_MOVE:
     float dx=event.getRawX()-down[0],dy=event.getRawY()-down[1];
     if(Math.hypot(dx,dy)>dp(a,7))dragging[0]=true;
     if(dragging[0]){v.setX(Math.max(dp(a,8),Math.min(outer.getWidth()-v.getWidth()-dp(a,8),origin[0]+dx)));v.setY(Math.max(dp(a,8),Math.min(outer.getHeight()-v.getHeight()-dp(a,75),origin[1]+dy)));}
     return true;
    case MotionEvent.ACTION_UP:
     if(!dragging[0])v.performClick();
     else {v.setX(v.getX()+v.getWidth()/2<outer.getWidth()/2?dp(a,9):outer.getWidth()-v.getWidth()-dp(a,9));a.getPreferences(0).edit().putFloat("kintoSupportX",v.getX()).putFloat("kintoSupportY",v.getY()).apply();}
     return true;
    default:return false;
   }
  });
  new Thread(()->{
   try{
    HttpURLConnection c=(HttpURLConnection)new URL(ENDPOINT).openConnection();
    c.setConnectTimeout(7000);c.setReadTimeout(7000);c.setRequestMethod("POST");c.setDoOutput(true);
    c.setRequestProperty("apikey",PUBLIC_KEY);c.setRequestProperty("Authorization","Bearer "+PUBLIC_KEY);c.setRequestProperty("Content-Type","application/json");
    try(OutputStream stream=c.getOutputStream()){stream.write("{}".getBytes(StandardCharsets.UTF_8));}
    if(c.getResponseCode()!=200){c.disconnect();return;}
    ByteArrayOutputStream buf=new ByteArrayOutputStream();
    try(InputStream in=c.getInputStream()){byte[] chunk=new byte[4096];int n;while((n=in.read(chunk))!=-1&&buf.size()<262144)buf.write(chunk,0,n);}
    c.disconnect();String safe=number(settings(new JSONTokener(buf.toString("UTF-8")).nextValue()));
    if(safe.isEmpty())return;
    a.runOnUiThread(()->{if(a.isFinishing()||a.isDestroyed())return;phone[0]=safe;fab.setVisibility(View.VISIBLE);outer.post(()->{float x=a.getPreferences(0).getFloat("kintoSupportX",-1),y=a.getPreferences(0).getFloat("kintoSupportY",-1);if(x>=0&&y>=0){fab.setX(Math.max(8,Math.min(outer.getWidth()-fab.getWidth()-8,x)));fab.setY(Math.max(8,Math.min(outer.getHeight()-fab.getHeight()-dp(a,75),y)));}});});
   }catch(Exception ignored){}
  },"kinto-public-support").start();
 }
}
