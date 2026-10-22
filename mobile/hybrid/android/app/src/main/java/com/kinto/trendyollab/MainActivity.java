package com.kinto.trendyollab;
import android.app.*;import android.os.*;import android.content.*;import android.net.Uri;import android.graphics.Color;import android.view.*;import android.webkit.*;import android.widget.*;import android.print.*;import android.database.Cursor;import android.provider.OpenableColumns;import org.json.*;import java.util.*;

/** KINTO account browser. External retailer documents never load in this process. */
public class MainActivity extends Activity {
 private WebView web;private TextView status;private FrameLayout surface;private final ArrayList<WebView> popupViews=new ArrayList<>();private final ArrayList<View> popupPanels=new ArrayList<>();private View fullVideo;private WebChromeClient.CustomViewCallback fullVideoCallback;private ValueCallback<Uri[]> upload;private boolean expectedFixture;
 private static final int SHOP=21,FILE=22;private static final String HOME="https://shopkinto.com/",DRAFTS="preview_global_orders_v1";
 @Override public void onCreate(Bundle state){super.onCreate(state);expectedFixture=state!=null&&state.getBoolean("expectedFixture",false);
  LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setBackgroundColor(Color.rgb(6,59,50));
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i;});
  status=new TextView(this);status.setText("KINTO Preview — الموقع حي؛ الطلب العالمي التجريبي محلي فقط");status.setTextColor(Color.WHITE);status.setTextSize(12);status.setPadding(12,8,12,6);
  web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));surface=new FrameLayout(this);surface.addView(root);setContentView(surface);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(true);s.setMediaPlaybackRequiresUserGesture(true);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){if(r.isForMainFrame()&&"kinto-app://print".equals(r.getUrl().toString())){printView(v);return true;}return r.isForMainFrame()&&!route(r.getUrl().toString());}
   @Override public void onPageFinished(WebView v,String u){if(accountUrl(u))injectCompat(v);}
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){if(getIntent().getBooleanExtra("webviewCompatFixture",false)&&r.getUrl().toString().equals("https://shopkinto.com/__kinto_fixture.mp4")){try{return new WebResourceResponse("video/mp4",null,getAssets().open("fixture-video.mp4"));}catch(Exception e){return null;}}return null;}
   @Override public void onPageStarted(WebView v,String u,android.graphics.Bitmap b){if(!accountUrl(u)){v.stopLoading();status.setText("تم منع صفحة خارجية من فتح جلسة KINTO");}}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())status.setText("تعذر تحميل KINTO — تحقق من الإنترنت ثم اختر تحديث من القائمة");}
  });
  web.setWebChromeClient(chromeClient());
  web.setDownloadListener((url,ua,disposition,mime,length)->{if(!accountUrl(url)){external(url);return;}try{android.app.DownloadManager.Request req=new android.app.DownloadManager.Request(Uri.parse(url));String cookie=CookieManager.getInstance().getCookie(url);if(cookie!=null)req.addRequestHeader("Cookie",cookie);req.addRequestHeader("User-Agent",ua);req.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);req.setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,URLUtil.guessFileName(url,disposition,mime));((android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(req);status.setText("بدأ تنزيل الملف من KINTO");}catch(Exception e){status.setText("تعذر التنزيل؛ استخدم فتح بالمتصفح من القائمة");}});
  if(getIntent().getBooleanExtra("webviewCompatFixture",false)){try{web.loadDataWithBaseURL(HOME+"__compat",asset("webview-regression.html"),"text/html","UTF-8",HOME+"__compat");}catch(Exception e){finish();}}
  else if(state==null||web.restoreState(state)==null)web.loadUrl(HOME);
 }
 private String asset(String name)throws java.io.IOException{try(java.io.InputStream in=getAssets().open(name)){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}}
 private void injectCompat(WebView v){try{v.evaluateJavascript(asset("kinto-webview-compat.js"),null);}catch(Exception e){Toast.makeText(this,"تعذر تهيئة توافق التطبيق",Toast.LENGTH_SHORT).show();}}
 // document.write can complete after the blank popup's navigation callbacks.
 // Retry only while this trusted popup is alive, then stop once its invoice is styled.
 private void prepareDocument(WebView v,int attempts){v.postDelayed(()->{
  if(!popupViews.contains(v))return;
  injectCompat(v);
  v.evaluateJavascript("Boolean(document.getElementById('kinto-app-invoice-layout'))",done->{if(!"true".equals(done)&&attempts>0)prepareDocument(v,attempts-1);});
 },500);}
 private void printView(WebView v){PrintManager pm=(PrintManager)getSystemService(PRINT_SERVICE);pm.print("KINTO",v.createPrintDocumentAdapter("KINTO"),new PrintAttributes.Builder().build());}
 private void closePopup(WebView v){int i=popupViews.indexOf(v);if(i<0)return;surface.removeView(popupPanels.remove(i));popupViews.remove(i);v.stopLoading();v.destroy();}
 private void hideVideo(){if(fullVideo==null)return;surface.removeView(fullVideo);fullVideo=null;getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);if(fullVideoCallback!=null){WebChromeClient.CustomViewCallback c=fullVideoCallback;fullVideoCallback=null;c.onCustomViewHidden();}}
 private WebChromeClient chromeClient(){return new WebChromeClient(){
  @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> c,FileChooserParams params){if(upload!=null)upload.onReceiveValue(null);upload=c;try{startActivityForResult(params.createIntent(),FILE);return true;}catch(Exception e){upload=null;return false;}}
  @Override public boolean onCreateWindow(WebView source,boolean dialog,boolean gesture,Message msg){
   if(!(accountUrl(source.getUrl())||popupViews.contains(source))||popupViews.size()>=3)return false;
   WebView child=new WebView(MainActivity.this);WebSettings s=child.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(false);s.setSupportMultipleWindows(true);s.setJavaScriptCanOpenWindowsAutomatically(true);s.setMediaPlaybackRequiresUserGesture(true);CookieManager.getInstance().setAcceptThirdPartyCookies(child,false);
   LinearLayout panel=new LinearLayout(MainActivity.this);panel.setOrientation(1);panel.setBackgroundColor(Color.WHITE);LinearLayout tools=new LinearLayout(MainActivity.this);panel.addView(tools);
   TextView origin=new TextView(MainActivity.this);origin.setText("KINTO — معاينة مستند");origin.setTextColor(Color.rgb(6,59,50));tools.addView(origin,new LinearLayout.LayoutParams(0,-2,1));Button close=new Button(MainActivity.this);close.setText("إغلاق");close.setOnClickListener(x->closePopup(child));tools.addView(close);Button print=new Button(MainActivity.this);print.setText("طباعة / PDF");print.setOnClickListener(x->printView(child));tools.addView(print);panel.addView(child,new LinearLayout.LayoutParams(-1,0,1));popupViews.add(child);popupPanels.add(panel);surface.addView(panel,new FrameLayout.LayoutParams(-1,-1));
   child.setWebViewClient(new WebViewClient(){
    @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){if(!request.isForMainFrame())return false;String u=request.getUrl().toString();if(u.equals("kinto-app://print")){printView(v);return true;}if(u.equals("about:blank")||accountUrl(u))return false;route(u);closePopup(v);return true;}
    @Override public void onPageStarted(WebView v,String u,android.graphics.Bitmap b){if(!u.equals("about:blank")&&!accountUrl(u)){v.stopLoading();closePopup(v);}}
    @Override public void onPageFinished(WebView v,String u){if(u.equals("about:blank")||accountUrl(u))injectCompat(v);if(accountUrl(u))origin.setText("KINTO — shopkinto.com");}
   });
   child.setWebChromeClient(chromeClient());((WebView.WebViewTransport)msg.obj).setWebView(child);msg.sendToTarget();prepareDocument(child,119);return true;
  }
  @Override public void onReceivedTitle(WebView v,String title){if(popupViews.contains(v))v.post(()->{if(popupViews.contains(v))injectCompat(v);});}
  @Override public void onProgressChanged(WebView v,int progress){if(progress==100&&(accountUrl(v.getUrl())||popupViews.contains(v)))injectCompat(v);}
  @Override public void onCloseWindow(WebView v){closePopup(v);}
  @Override public void onShowCustomView(View view,CustomViewCallback cb){if(fullVideo!=null){cb.onCustomViewHidden();return;}fullVideo=view;fullVideoCallback=cb;view.setBackgroundColor(Color.BLACK);surface.addView(view,new FrameLayout.LayoutParams(-1,-1));getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);}
  @Override public void onHideCustomView(){hideVideo();}
 };}
 @Override public boolean onKeyUp(int code,KeyEvent event){if(code==KeyEvent.KEYCODE_MENU){menu();return true;}return super.onKeyUp(code,event);}
 static boolean accountUrl(String u){try{java.net.URI x=new java.net.URI(u);return "https".equalsIgnoreCase(x.getScheme())&&"shopkinto.com".equalsIgnoreCase(x.getHost())&&x.getRawUserInfo()==null&&(x.getPort()==-1||x.getPort()==443);}catch(Exception e){return false;}}
 private boolean route(String u){if(accountUrl(u))return true;if(UrlPolicy.allowed(u)){openShop(u,false);return false;}external(u);return false;}
 private void external(String u){try{Uri x=Uri.parse(u);String s=x.getScheme();if(!Arrays.asList("https","tel","mailto","whatsapp").contains(s))throw new IllegalArgumentException();new AlertDialog.Builder(this).setMessage("فتح الرابط خارج التطبيق؟ لن تُنقل جلسة KINTO إلى المتصفح.").setPositiveButton("فتح",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,x).addCategory(Intent.CATEGORY_BROWSABLE));}catch(Exception e){status.setText("لا يوجد تطبيق لفتح هذا الرابط");}}).setNegativeButton("إلغاء",null).show();}catch(Exception e){status.setText("الرابط غير مدعوم");}}
 private void add(LinearLayout n,String label,Runnable run){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(12);n.addView(b,new LinearLayout.LayoutParams(0,-2,1));b.setOnClickListener(v->run.run());}
 private void openShop(String u,boolean fixture){expectedFixture=fixture;startActivityForResult(new Intent(this,ShoppingActivity.class).putExtra("fixture",fixture).putExtra("url",u),SHOP);}
 private void menu(){new AlertDialog.Builder(this).setTitle("KINTO Preview").setItems(new String[]{"تجربة كاملة ببيانات مصطنعة","تحديث KINTO","طباعة الصفحة / PDF","فتح KINTO في المتصفح"},(d,w)->{if(w==0)openShop("https://www.trendyol.com/fixture-p-123456",true);if(w==1)web.reload();if(w==2){PrintManager pm=(PrintManager)getSystemService(PRINT_SERVICE);pm.print("KINTO",web.createPrintDocumentAdapter("KINTO"),new PrintAttributes.Builder().build());}if(w==3)external(web.getUrl());}).show();}
 private JSONArray orders(){try{return new JSONArray(getPreferences(MODE_PRIVATE).getString(DRAFTS,"[]"));}catch(Exception e){return new JSONArray();}}
 private void drafts(){JSONArray a=orders();StringBuilder text=new StringBuilder("هذه طلبات اختبار محلية فقط. لا تظهر للموظف ولا تتضمن دفعاً.\n\n");for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null)text.append(o.optString("testOrderCode")).append("\n").append(o.optString("title")).append("\n").append(o.optString("url")).append("\n").append(o.optJSONObject("selectedOptions")).append(" × ").append(o.optInt("quantity")).append("\n").append(o.optString("convertedTotalIQD")).append(" IQD — ").append(o.optString("pricingSource")).append("\nالشحن يُحدد بعد مراجعة الموظف.\n\n");}new AlertDialog.Builder(this).setTitle("طلب KINTO التجريبي ("+a.length()+")").setMessage(text).setPositiveButton("إغلاق",null).setNeutralButton("مسح التجارب",(d,w)->new AlertDialog.Builder(this).setMessage("مسح بيانات التجربة المحلية؟").setPositiveButton("مسح",(x,y)->getPreferences(MODE_PRIVATE).edit().remove(DRAFTS).apply()).setNegativeButton("إلغاء",null).show()).show();}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==FILE){if(upload!=null)upload.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));upload=null;return;}if(request!=SHOP||result!=RESULT_OK||data==null)return;
  String nav=data.getStringExtra("navigation");if(nav!=null){
   if(!Arrays.asList("home","stores","cart","orders","chat","favorites","account").contains(nav))return;
   if(nav.equals("home")){web.loadUrl(HOME);return;}if(nav.equals("stores")){new AlertDialog.Builder(this).setTitle("المتاجر").setItems(new String[]{"المتاجر المحلية","المتاجر العالمية"},(d,which)->web.loadUrl(HOME+(which==0?"local-stores.html":"global-stores.html"))).setNegativeButton("إلغاء",null).show();return;}
   // Resolve the same customer navigation in the trusted KINTO renderer only.
   web.evaluateJavascript("(()=>{const action="+JSONObject.quote(nav)+";window.KintoMobileAppNavV319?.sync?.();const ids={cart:'kintoMobileCart',orders:'kintoMobileOrders',chat:'kintoMobileChat',favorites:'kintoMobileFavorites',account:'kintoMobileAccount'};const link=document.getElementById(ids[action]);if(link){link.click();return;}const id=String(window.getStoredCustomerId?.()||localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();const logged=Boolean(id||window.KintoCustomerSessionV150?.read?.());if(!logged){location.href='login.html';return;}const q=new URLSearchParams(id?{customerId:id}:{});if(action==='account')q.set('openAccount','1');else q.set('tab',({cart:'drafts',orders:'activeOrders',chat:'chatHelp',favorites:'favorites'})[action]);location.href='dashboard.html?'+q;})()",null);return;
  }
  try{String raw=data.getStringExtra("product");if(raw==null||raw.length()>32768)throw new IllegalArgumentException();JSONObject p=new JSONObject(raw);if(!UrlPolicy.product(p.optString("url"))||!p.optBoolean("optionsConfirmed")||!p.optBoolean("testOnly")||p.optBoolean("fixture")!=expectedFixture||p.optString("title").length()>500)throw new IllegalArgumentException();
   String source=p.getString("pricingSource");if(expectedFixture&&!source.equals("synthetic-fixture"))throw new IllegalArgumentException();if(!expectedFixture&&!source.equals("admin-public-read"))throw new IllegalArgumentException();Pricing.Snapshot snap=new Pricing.Snapshot(p.getString("exchangeRate"),p.getString("commissionPercent"),source);String total=Pricing.total(p.getString("price"),p.getInt("quantity"),snap);if(!total.equals(p.getString("convertedTotalIQD")))throw new IllegalArgumentException();
   p.put("testOrderCode","TEST-"+UUID.randomUUID().toString().substring(0,8).toUpperCase(Locale.ROOT));p.put("createdAt",System.currentTimeMillis());p.put("serverSubmitted",false);JSONArray a=orders();if(a.length()>=100)throw new IllegalArgumentException();a.put(p);if(!getPreferences(MODE_PRIVATE).edit().putString(DRAFTS,a.toString()).commit())throw new IllegalStateException();status.setText("أُضيف إلى طلب KINTO التجريبي على الجهاز — لم يُرسل إلى الموظف");drafts();
  }catch(Exception e){status.setText("تعذر التحقق من بيانات المنتج؛ لم يُضف الطلب");}
 }
 @Override protected void onSaveInstanceState(Bundle b){b.putBoolean("expectedFixture",expectedFixture);web.saveState(b);super.onSaveInstanceState(b);}
 @Override public void onBackPressed(){if(fullVideo!=null){hideVideo();return;}if(!popupViews.isEmpty()){WebView v=popupViews.get(popupViews.size()-1);if(v.canGoBack())v.goBack();else closePopup(v);return;}if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(upload!=null)upload.onReceiveValue(null);super.onDestroy();}
}
