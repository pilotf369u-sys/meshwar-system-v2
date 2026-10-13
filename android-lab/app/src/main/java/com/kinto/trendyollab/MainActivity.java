package com.kinto.trendyollab;
import android.app.*;
import android.os.Bundle;
import android.graphics.Color;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
 private WebView web; private TextView status; private Button cartButton; private String injectScript;
 private static final String KEY="test_cart";
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setStatusBarColor(Color.rgb(10,47,35));
  LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(10,47,35));
  // Keep controls away from system status/navigation bars, including edge-to-edge Android 15.
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom()); return i;});
  TextView title=new TextView(this); title.setText("KINTO | مختبر ترنديول"); title.setTextColor(Color.rgb(242,205,120)); title.setTextSize(19); title.setPadding(16,10,16,6); root.addView(title);
  status=new TextView(this); status.setText("سلة تجريبية على هاتفك فقط — لا ترسل طلبات"); status.setTextColor(Color.WHITE); status.setPadding(16,0,16,8); root.addView(status);
  LinearLayout tools=new LinearLayout(this); tools.setOrientation(LinearLayout.HORIZONTAL);
  Button home=button("ترنديول"); home.setOnClickListener(v->web.loadUrl("https://www.trendyol.com/")); tools.addView(home,new LinearLayout.LayoutParams(0,-2,1));
  Button reload=button("تحديث"); reload.setOnClickListener(v->web.reload());tools.addView(reload,new LinearLayout.LayoutParams(0,-2,1));
  cartButton=button("السلة");cartButton.setOnClickListener(v->showCart()); tools.addView(cartButton,new LinearLayout.LayoutParams(0,-2,1));root.addView(tools);
  web=new WebView(this); root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
  Button fallback=button("اطلب عبر KINTO — زر التطبيق");fallback.setOnClickListener(v->capture());root.addView(fallback);
  setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  try(InputStream in=getAssets().open("order-button.js")){ByteArrayOutputStream bytes=new ByteArrayOutputStream(); byte[] buffer=new byte[4096]; int length; while((length=in.read(buffer))!=-1)bytes.write(buffer,0,length); injectScript=new String(bytes.toByteArray(),StandardCharsets.UTF_8);}catch(IOException e){status.setText("تعذر تحميل زر الصفحة؛ استخدم زر التطبيق");}
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){String url=r.getUrl().toString();if(url.equals("kinto-lab://capture")){if(r.isForMainFrame())capture();return true;}if(!UrlPolicy.allowed(url)){if(r.isForMainFrame())status.setText("الرابط خارج ترنديول؛ لم يتم فتحه في المختبر");return true;}return false;}
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){if(!UrlPolicy.allowed(url)){v.stopLoading();status.setText("تم إيقاف رابط غير مسموح");}}
   @Override public void onPageFinished(WebView v,String url){if(UrlPolicy.allowed(url)){status.setText("اختر منتجاً ثم اضغط زر KINTO — حفظ رابط فقط");if(injectScript!=null)v.evaluateJavascript(injectScript,null);}}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())status.setText("تعذر فتح الصفحة. تحقق من الاتصال أو حدّث مرة واحدة.");}
  });
  updateCount();web.loadUrl("https://www.trendyol.com/");
 }
 private Button button(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);return b;}
 private JSONArray cart(){try{return new JSONArray(getPreferences(MODE_PRIVATE).getString(KEY,"[]"));}catch(JSONException e){return new JSONArray();}}
 private void updateCount(){cartButton.setText("السلة ("+cart().length()+")");}
 private void capture(){
  String url=web.getUrl();if(!UrlPolicy.product(url)){new AlertDialog.Builder(this).setMessage("افتح صفحة منتج في ترنديول أولاً. لم نحفظ شيئاً.").setPositiveButton("حسناً",null).show();return;}
  final String savedUrl=url;final String title=web.getTitle()==null?"منتج ترنديول":web.getTitle();
  new AlertDialog.Builder(this).setTitle("إضافة تجريبية فقط").setMessage(title+"\n\n"+savedUrl+"\n\nلا سعر ولا مقاس محفوظ بعد، ولا إرسال إلى KINTO.").setPositiveButton("حفظ الرابط",(d,w)->{
   try{JSONArray items=cart();for(int i=0;i<items.length();i++)if(savedUrl.equals(items.getJSONObject(i).optString("url"))){Toast.makeText(this,"الرابط محفوظ مسبقاً",Toast.LENGTH_SHORT).show();return;}
    JSONObject item=new JSONObject();item.put("url",savedUrl);item.put("title",title);item.put("savedAt",System.currentTimeMillis());items.put(item);getPreferences(MODE_PRIVATE).edit().putString(KEY,items.toString()).apply();updateCount();Toast.makeText(this,"تم حفظ الرابط في السلة التجريبية",Toast.LENGTH_SHORT).show();
   }catch(JSONException e){Toast.makeText(this,"تعذر حفظ الرابط",Toast.LENGTH_SHORT).show();}
  }).setNegativeButton("إلغاء",null).show();
 }
 private void showCart(){JSONArray items=cart();StringBuilder text=new StringBuilder();for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item!=null)text.append(i+1).append(". ").append(item.optString("title")).append("\n").append(item.optString("url")).append("\n\n");}new AlertDialog.Builder(this).setTitle("السلة التجريبية — على الهاتف فقط").setMessage(items.length()==0?"السلة فارغة":text.toString()).setPositiveButton("إغلاق",null).setNeutralButton("مسح السلة",(d,w)->new AlertDialog.Builder(this).setMessage("مسح روابط التجربة من الهاتف؟").setPositiveButton("مسح",(a,b)->{getPreferences(MODE_PRIVATE).edit().remove(KEY).apply();updateCount();}).setNegativeButton("إلغاء",null).show()).show();}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
