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

public class ShoppingActivity extends Activity {
 private WebView web; private TextView status;  private String injectScript, readerScript, hepsiReaderScript; private boolean reading=false; private String currentProductPage="";
 private boolean fixture; private boolean hepsiFixture; private String fixtureUrl; private volatile Pricing.Snapshot quote; private volatile long quoteReadAt,configAttemptAt; private boolean badgeReading=false; private volatile boolean configLoading=false; private final android.os.Handler pricingHandler=new android.os.Handler(android.os.Looper.getMainLooper());
 @Override public void onCreate(Bundle state) {
  super.onCreate(state); fixture=PreviewMode.enabled(this)&&getIntent().getBooleanExtra("fixture",false);hepsiFixture=fixture&&"hepsiburada".equals(getIntent().getStringExtra("fixtureStore"));fixtureUrl=hepsiFixture?"https://www.hepsiburada.com/kinto-fixture-p-HBCV0000TEST":"https://www.trendyol.com/fixture-p-123456";
  getWindow().setStatusBarColor(Color.rgb(10,47,35));
  LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(10,47,35));
  // Keep controls away from system status/navigation bars, including edge-to-edge Android 15.
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom()); return i;});
  // No persistent title/status/tools above the external store. Status remains accessible via toasts.
  status=new TextView(this){@Override public void setText(CharSequence value,TextView.BufferType type){super.setText(value,type);if(value!=null&&value.length()>0)Toast.makeText(ShoppingActivity.this,value,Toast.LENGTH_LONG).show();}};
  web=new WebView(this); root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
  WebView navigation=new WebView(this);navigation.setBackgroundColor(Color.rgb(17,26,47));
  navigation.getSettings().setJavaScriptEnabled(false);navigation.getSettings().setAllowFileAccess(false);navigation.getSettings().setAllowContentAccess(false);
  navigation.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest request){
   String action=request.getUrl().getHost();if(request.isForMainFrame()&&"kinto-nav".equals(request.getUrl().getScheme())&&java.util.Arrays.asList("home","stores","cart","orders","chat","favorites","account").contains(action)){
    setResult(RESULT_OK,new android.content.Intent().putExtra("navigation",action));finish();
   }return true;
  }});
  root.addView(navigation,new LinearLayout.LayoutParams(-1,Math.round(66*getResources().getDisplayMetrics().density)));
  try{navigation.loadDataWithBaseURL(null,asset("customer-navigation.html"),"text/html","UTF-8",null);}catch(IOException e){finish();}
  setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  try{injectScript=asset("order-button.js");readerScript=asset("product-reader.js");hepsiReaderScript=asset("hepsiburada-reader.js");}catch(IOException e){status.setText("تعذر تحميل زر الصفحة؛ أعد فتح التطبيق");}
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){String url=r.getUrl().toString();if(url.equals("kinto-lab://capture")){if(r.isForMainFrame())view.post(()->refreshAndCapture());return true;}if(fixture&&!url.equals(fixtureUrl))return true;if(!UrlPolicy.allowed(url)){if(r.isForMainFrame())status.setText("الرابط خارج المتاجر المدعومة؛ لم يتم فتحه");return true;}return false;}
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){if(!UrlPolicy.allowed(url)){v.stopLoading();status.setText("تم إيقاف رابط غير مسموح");}}
   @Override public void onPageFinished(WebView v,String url){if(UrlPolicy.allowed(url)){if(!url.equals(currentProductPage))badge("جارٍ التحقق من السعر");currentProductPage=url;if(injectScript!=null)v.evaluateJavascript(injectScript,null);}}
   @Override public void doUpdateVisitedHistory(WebView v,String url,boolean reload){if(UrlPolicy.allowed(url)){if(!url.equals(currentProductPage))badge("جارٍ التحقق من السعر");currentProductPage=url;if(injectScript!=null)v.evaluateJavascript(injectScript,null);}}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())status.setText("تعذر فتح الصفحة. تحقق من الاتصال أو حدّث مرة واحدة.");}
  });
  if(fixture){status.setText("بيانات اختبار مصطنعة — ليست أسعار الأدمن");quote=fixturePricing();quoteReadAt=System.currentTimeMillis();currentProductPage=fixtureUrl;try{web.loadDataWithBaseURL(fixtureUrl,asset(hepsiFixture?"fixture-hepsiburada.html":"fixture-product.html"),"text/html","UTF-8",fixtureUrl);}catch(Exception e){finish();}}
  else { web.loadUrl(UrlPolicy.allowed(getIntent().getStringExtra("url"))?getIntent().getStringExtra("url"):"https://www.trendyol.com/");refreshConfigInBackground(); }
 }
 private Pricing.Snapshot fixturePricing(){try{
  Pricing.Snapshot parsed=AdminPricing.parse(new JSONObject(asset("pricing-fixture.json")));
  return new Pricing.Snapshot(parsed.sourcePerUsd.toPlainString(),parsed.targetPerUsd.toPlainString(),parsed.commission.toPlainString(),parsed.fromCurrency,parsed.toCurrency,"synthetic-fixture",parsed.revision);
 }catch(Exception e){throw new IllegalStateException("Synthetic pricing contract failed",e);}}
 private Button button(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);return b;}
 private String asset(String name)throws IOException{try(InputStream in=getAssets().open(name)){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);return new String(bytes.toByteArray(),StandardCharsets.UTF_8);}}
 private void refreshAndCapture(){
  if(reading)return;
  if(fixture){capture();return;}
  reading=true;new Thread(()->{try{Pricing.Snapshot fresh=AdminPricing.load();runOnUiThread(()->{if(isFinishing()||isDestroyed())return;quote=fresh;quoteReadAt=System.currentTimeMillis();reading=false;capture();});}catch(Exception e){runOnUiThread(()->{if(isFinishing()||isDestroyed())return;quote=null;reading=false;new AlertDialog.Builder(this).setMessage("تعذر التحقق من إعدادات التسعير المعتمدة. لم نحسب سعراً أو نرسل طلباً. الشحن يُحدَّد بعد مراجعة الموظف.").setPositiveButton("حسناً",null).show();});}},"kinto-price-refresh").start();
 }
 private final Runnable badgeLoop=new Runnable(){public void run(){updatePriceBadge();pricingHandler.postDelayed(this,2000);}};
 @Override protected void onResume(){super.onResume();pricingHandler.removeCallbacks(badgeLoop);pricingHandler.postDelayed(badgeLoop,700);}
 @Override protected void onPause(){pricingHandler.removeCallbacks(badgeLoop);super.onPause();}
 private void badge(String text){web.evaluateJavascript("(()=>{const b=document.getElementById('kinto-lab-order');if(b)b.textContent="+JSONObject.quote("＋ أضف إلى KINTO\n"+text)+";})()",null);}
 private void refreshConfigInBackground(){
  if(fixture||configLoading||System.currentTimeMillis()-configAttemptAt<30000)return;
  configLoading=true;configAttemptAt=System.currentTimeMillis();new Thread(()->{try{Pricing.Snapshot fresh=AdminPricing.load();quote=fresh;quoteReadAt=System.currentTimeMillis();}catch(Exception ignored){}finally{configLoading=false;}},"kinto-pricing-read").start();
 }
 private void updatePriceBadge(){
  refreshConfigInBackground();
  if(web==null||isFinishing()||reading||badgeReading||readerScript==null||!UrlPolicy.product(currentProductPage))return;
  final String page=currentProductPage;final Pricing.Snapshot snapshot=quote;
  if(snapshot==null||(!fixture&&System.currentTimeMillis()-quoteReadAt>300000)){badge("السعر غير متاح — اضغط للتحقق");return;}
  badgeReading=true;web.evaluateJavascript(UrlPolicy.source(currentProductPage).equals("hepsiburada")?hepsiReaderScript:readerScript,result->{badgeReading=false;if(!page.equals(currentProductPage))return;try{
   Object decoded=new JSONTokener(result).nextValue();JSONObject item=new JSONObject((String)decoded);
   if(item.has("error")||!page.equals(item.optString("pageUrl"))||!snapshot.fromCurrency.equals(item.optString("currency")))throw new IllegalArgumentException();
   boolean hepsiOptionsPending="hepsiburada".equals(item.optString("source"))&&item.optBoolean("optionsPending");
   String amount=hepsiOptionsPending?item.getString("displayPrice"):item.getString("price");
   badge("تقديري: "+Pricing.total(amount,1,snapshot)+" "+snapshot.toCurrency+" — بدون الشحن"+(hepsiOptionsPending?"\nاختر خيارات المنتج أولاً":""));
  }catch(Exception e){badge("السعر غير مؤكد — راجع المنتج");}});
 }
 private void capture(){
  final String url=currentProductPage;if(!UrlPolicy.product(url)){new AlertDialog.Builder(this).setMessage("افتح صفحة منتج أولاً. لم نحفظ شيئاً.").setPositiveButton("حسناً",null).show();return;}
  if(reading||readerScript==null)return;reading=true;
  web.evaluateJavascript(UrlPolicy.source(currentProductPage).equals("hepsiburada")?hepsiReaderScript:readerScript,result->{reading=false;
   if(!url.equals(currentProductPage)){status.setText("تغيرت الصفحة؛ اضغط الإضافة من المنتج الجديد");return;}
   try{Object decoded=new JSONTokener(result).nextValue();if(!(decoded instanceof String))throw new JSONException("Missing result");JSONObject item=new JSONObject((String)decoded);
    if(item.has("error")||!url.equals(item.optString("pageUrl"))||quote==null||!quote.fromCurrency.equals(item.optString("currency")))throw new JSONException("Page mismatch");
    item.put("url",url);item.put("savedAt",System.currentTimeMillis());confirmProduct(item);
   }catch(JSONException e){status.setText("تعذرت قراءة بيانات المنتج؛ لم نحفظ شيئاً. حدّث الصفحة وجرب.");}
  });
 }
 private TextView line(String value){TextView t=new TextView(this);t.setText(value);t.setTextSize(14);t.setTextColor(android.graphics.Color.rgb(35,57,47));t.setPadding(18,10,18,10);t.setTextDirection(android.view.View.TEXT_DIRECTION_FIRST_STRONG);return t;}
 private void styleField(EditText field){
  android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(android.graphics.Color.WHITE);bg.setCornerRadius(16*getResources().getDisplayMetrics().density);bg.setStroke(2,android.graphics.Color.rgb(214,221,213));field.setBackground(bg);field.setPadding(24,14,24,14);field.setTextColor(android.graphics.Color.rgb(10,47,35));field.setTextSize(17);
  LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,-2);params.setMargins(12,4,12,12);field.setLayoutParams(params);field.setMinHeight(Math.round(48*getResources().getDisplayMetrics().density));
 }
 private String priceLabel(JSONObject item){double price=item.optDouble("price",Double.NaN);if(!Double.isFinite(price)||price<=0)return "السعر: لم نتمكن من قراءته بثقة";return ("visible-basket-offer".equals(item.optString("priceSource"))?"سعر عرض السلة المرصود: ":"السعر المرصود: ")+String.format(java.util.Locale.US,"%.2f",price)+" ليرة تركية";}
 private void confirmProduct(JSONObject item){
  LinearLayout details=new LinearLayout(this);details.setOrientation(LinearLayout.VERTICAL);details.setPadding(20,16,20,20);details.setLayoutDirection(android.view.View.LAYOUT_DIRECTION_RTL);details.setBackgroundColor(android.graphics.Color.rgb(250,250,246));
  details.addView(line(item.optString("sourceName","Trendyol")+" — "+item.optString("title")));
  String image=item.optString("image");if(!image.isEmpty()){
   ImageView preview=new ImageView(this);preview.setAdjustViewBounds(true);preview.setScaleType(ImageView.ScaleType.FIT_CENTER);details.addView(preview,new LinearLayout.LayoutParams(-1,Math.round(150*getResources().getDisplayMetrics().density)));loadPreview(image,preview);
  }
  details.addView(line(priceLabel(item)));
  if("hepsiburada".equals(item.optString("source"))&&"visible-before-conditional-offer".equals(item.optString("priceSource")))details.addView(line("اعتمدنا السعر العادي الظاهر قبل عرض السلة أو العضوية؛ استحقاق العرض يُراجع عند الشراء."));
  final Pricing.Snapshot snapshot=quote;
  if(!Double.isFinite(item.optDouble("price",Double.NaN))||item.optDouble("price",0)<=0){new AlertDialog.Builder(this).setMessage("السعر غير مؤكد؛ لم نحسب قيمة أو نضف طلباً.").setPositiveButton("حسناً",null).show();return;}
  if(snapshot==null){new AlertDialog.Builder(this).setMessage("تعذر التحقق من السعر المعتمد. أعد المحاولة بعد قليل.").setPositiveButton("حسناً",null).show();return;}
  if(snapshot.source.equals("synthetic-fixture"))details.addView(line("بيانات اختبار مصطنعة — ليست أسعاراً معتمدة للشراء"));
  details.addView(line("السعر للمنتج فقط، ولا يشمل الشحن. تُحدد تكلفة الشحن بعد مراجعة الموظف للطلب."));
  if("visible-basket-offer".equals(item.optString("priceSource"))){details.addView(line("عرض يُطبق داخل سلة ترنديول؛ يلزم تأكيد استحقاقه والسعر النهائي عند الشراء."));double before=item.optDouble("priceBeforeBasketDiscount",Double.NaN);if(Double.isFinite(before))details.addView(line("قبل خصم السلة: "+String.format(java.util.Locale.US,"%.2f",before)+" ليرة تركية"));}
  if("structured".equals(item.optString("priceSource")))details.addView(line("السعر من بيانات الصفحة؛ طابقه مع السعر الظاهر قبل الحفظ."));
  if("AMBIGUOUS_PRICE".equals(item.optString("warning")))details.addView(line("وجدنا أسعاراً مختلفة؛ لم نعتمد سعراً تلقائياً."));
  JSONObject observed=item.optJSONObject("observedOptions"),required=item.optJSONObject("optionRequirements");
  String observedSize=observed==null?"":observed.optString("size"),observedColor=observed==null?"":observed.optString("color");
  details.addView(line("اختر اللون والمقاس أو الحجم في المتجر أولاً، ثم طابقهما هنا. راجع الخيارات وصحّحها عند الحاجة."));
  details.addView(line(observedSize.isEmpty()?"المقاس — اكتب المختار إن كان مطلوباً":"المقاس المقروء من الصفحة — طابقه"));
  EditText size=new EditText(this);size.setSingleLine(true);size.setText(observedSize);size.setHint("المقاس أو الحجم؛ فارغ إذا لا يوجد");size.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(60)});styleField(size);details.addView(size);
  details.addView(line(observedColor.isEmpty()?"اللون — اكتب المختار إن كان مطلوباً":"اللون المقروء من الصفحة — طابقه"));
  EditText color=new EditText(this);color.setSingleLine(true);color.setText(observedColor);color.setHint("اللون؛ فارغ إذا لا يوجد");color.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(60)});styleField(color);details.addView(color);
  details.addView(line("الكمية المطلوبة (1–99)"));
  EditText quantity=new EditText(this);quantity.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);quantity.setSingleLine(true);quantity.setText("1");styleField(quantity);details.addView(quantity);
  TextView total=line("");total.setTextSize(21);total.setTypeface(null,android.graphics.Typeface.BOLD);total.setTextColor(android.graphics.Color.rgb(10,47,35));total.setPadding(20,22,20,22);details.addView(total);
  quantity.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence t,int a,int c,int f){}public void onTextChanged(CharSequence t,int a,int before,int count){try{total.setText("إجمالي المنتجات: "+Pricing.total(item.optString("price"),CartRules.quantity(t.toString()),snapshot)+" "+snapshot.toCurrency+" — بدون الشحن");}catch(IllegalArgumentException e){total.setText("المجموع غير متاح: تحقق من الكمية أو السعر");}}public void afterTextChanged(android.text.Editable e){}});
  try{total.setText("إجمالي المنتجات: "+Pricing.total(item.optString("price"),1,snapshot)+" "+snapshot.toCurrency+" — بدون الشحن");}catch(IllegalArgumentException e){total.setText("المجموع غير متاح؛ السعر غير مقروء");}
  CheckBox confirmed=new CheckBox(this);confirmed.setText("طابقت المقاس أو الحجم واللون مع المتجر، أو المنتج بلا هذه الخيارات");details.addView(confirmed);
  details.addView(line("تُضاف مسودة المنتج أولاً؛ أكمل إرسالها للمراجعة من KINTO. الشراء بعد تأكيد التسديد وحسب التوفر."));
  ScrollView scroll=new ScrollView(this);scroll.addView(details);
  AlertDialog dialog=new AlertDialog.Builder(this).setTitle("مراجعة المنتج").setView(scroll).setPositiveButton("أؤكد الإضافة",null).setNegativeButton("إلغاء",null).create();
  dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
   String chosenSize=size.getText().toString().trim(),chosenColor=color.getText().toString().trim();
   if(required!=null&&required.optBoolean("size")&&chosenSize.isEmpty()){size.setError("اختر المقاس أو الحجم في المتجر وأكده هنا");return;}
   if(required!=null&&required.optBoolean("color")&&chosenColor.isEmpty()){color.setError("اختر اللون في المتجر وأكده هنا");return;}
   if(!confirmed.isChecked()){Toast.makeText(this,"أكد مطابقة الخيارات أولاً",Toast.LENGTH_SHORT).show();return;}
   try{int count=CartRules.quantity(quantity.getText().toString());JSONObject options=new JSONObject();options.put("size",chosenSize);options.put("color",chosenColor);item.put("selectedOptions",options);item.put("quantity",count);item.put("optionsConfirmed",true);item.put("sizeOrigin",!chosenSize.isEmpty()&&chosenSize.equals(observedSize)?"page-confirmed":"user-confirmed");item.put("colorOrigin",!chosenColor.isEmpty()&&chosenColor.equals(observedColor)?"page-confirmed":"user-confirmed");double unit=item.optDouble("price",Double.NaN);item.put("lineTotal",Double.isFinite(unit)&&unit>0?CartRules.total(unit,count):JSONObject.NULL);item.put("cartKey",CartRules.key(item.optString("source"),item.optString("productId"),item.optString("merchantId"),chosenSize,chosenColor));if(snapshot.toCurrency.equals("IQD"))item.put("convertedTotalIQD",Pricing.total(item.optString("price"),count,snapshot));item.put("exchangeRate",snapshot.rate.toPlainString());item.put("sourcePerUsd",snapshot.sourcePerUsd.toPlainString());item.put("targetPerUsd",snapshot.targetPerUsd.toPlainString());item.put("sourceCurrency",snapshot.fromCurrency);item.put("displayCurrency",snapshot.toCurrency);item.put("pricingRevision",snapshot.revision);item.put("convertedTotal",Pricing.total(item.optString("price"),count,snapshot));item.put("commissionPercent",snapshot.commission.toPlainString());item.put("pricingSource",snapshot.source);item.put("testOnly",true);item.put("fixture",fixture);item.put("shipping",JSONObject.NULL);setResult(RESULT_OK,new android.content.Intent().putExtra("product",item.toString()));dialog.dismiss();finish();}catch(IllegalArgumentException e){quantity.setError("أدخل عدداً صحيحاً من 1 إلى 99");}catch(JSONException e){Toast.makeText(this,"تعذر إضافة المنتج؛ أعد المحاولة",Toast.LENGTH_SHORT).show();}
  }));dialog.show();
  dialog.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.rgb(250,250,246)));
  dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(android.graphics.Color.rgb(10,47,35));
  dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTypeface(null,android.graphics.Typeface.BOLD);
  dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(android.graphics.Color.rgb(90,100,95));
 }
 private void loadPreview(String raw,ImageView target){
  if(!UrlPolicy.image(raw))return;
  new Thread(()->{java.net.HttpURLConnection c=null;try{c=(java.net.HttpURLConnection)new java.net.URL(raw).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(5000);c.setReadTimeout(5000);if(c.getResponseCode()!=200)return;try(InputStream in=c.getInputStream()){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(bytes.size()+n>2097152)return;bytes.write(b,0,n);}byte[] data=bytes.toByteArray();android.graphics.BitmapFactory.Options o=new android.graphics.BitmapFactory.Options();o.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeByteArray(data,0,data.length,o);o.inSampleSize=1;while(o.outWidth/o.inSampleSize>1000||o.outHeight/o.inSampleSize>1000)o.inSampleSize*=2;o.inJustDecodeBounds=false;android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeByteArray(data,0,data.length,o);if(bitmap!=null)runOnUiThread(()->{if(!isFinishing())target.setImageBitmap(bitmap);});}}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}},"kinto-product-image").start();
 }
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){pricingHandler.removeCallbacksAndMessages(null);if(web!=null)web.destroy();super.onDestroy();}
}
