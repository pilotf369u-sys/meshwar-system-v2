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
 private WebView web; private TextView status;  private String injectScript, readerScript; private boolean reading=false;
 private boolean fixture; private volatile Pricing.Snapshot quote;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state); fixture=getIntent().getBooleanExtra("fixture",false);
  getWindow().setStatusBarColor(Color.rgb(10,47,35));
  LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(10,47,35));
  // Keep controls away from system status/navigation bars, including edge-to-edge Android 15.
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom()); return i;});
  TextView title=new TextView(this); title.setText("KINTO | المتاجر العالمية"); title.setTextColor(Color.rgb(242,205,120)); title.setTextSize(19); title.setPadding(16,10,16,6); root.addView(title);
  status=new TextView(this); status.setText("طلب تجريبي على الجهاز — لا إرسال أو دفع فعلي"); status.setTextColor(Color.WHITE); status.setPadding(16,0,16,8); root.addView(status);
  LinearLayout tools=new LinearLayout(this); tools.setOrientation(LinearLayout.HORIZONTAL);
  Button home=button("ترنديول"); home.setOnClickListener(v->{if(!fixture)web.loadUrl("https://www.trendyol.com/");}); tools.addView(home,new LinearLayout.LayoutParams(0,-2,1));
  Button reload=button("تحديث"); reload.setOnClickListener(v->web.reload());tools.addView(reload,new LinearLayout.LayoutParams(0,-2,1));
  Button back=button("العودة إلى KINTO");back.setOnClickListener(v->finish()); tools.addView(back,new LinearLayout.LayoutParams(0,-2,1));root.addView(tools);
  web=new WebView(this); root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
  setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  try{injectScript=asset("order-button.js");readerScript=asset("product-reader.js");}catch(IOException e){status.setText("تعذر تحميل زر الصفحة؛ أعد فتح التطبيق");}
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest r){String url=r.getUrl().toString();if(url.equals("kinto-lab://capture")){if(r.isForMainFrame())capture();return true;}if(fixture&&!url.equals("https://www.trendyol.com/fixture-p-123456"))return true;if(!UrlPolicy.allowed(url)){if(r.isForMainFrame())status.setText("الرابط خارج ترنديول؛ لم يتم فتحه في المختبر");return true;}return false;}
   @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){if(!UrlPolicy.allowed(url)){v.stopLoading();status.setText("تم إيقاف رابط غير مسموح");}}
   @Override public void onPageFinished(WebView v,String url){if(UrlPolicy.allowed(url)){status.setText("اختر منتجاً — نقرأ البيانات لتأكيدها قبل الحفظ");if(injectScript!=null)v.evaluateJavascript(injectScript,null);}}
   @Override public void doUpdateVisitedHistory(WebView v,String url,boolean reload){if(UrlPolicy.allowed(url)&&injectScript!=null)v.evaluateJavascript(injectScript,null);}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())status.setText("تعذر فتح الصفحة. تحقق من الاتصال أو حدّث مرة واحدة.");}
  });
  if(fixture){status.setText("بيانات اختبار مصطنعة — ليست أسعار الأدمن");quote=new Pricing.Snapshot("50","10","synthetic-fixture");try{web.loadDataWithBaseURL("https://www.trendyol.com/fixture-p-123456",asset("fixture-product.html"),"text/html","UTF-8",null);}catch(Exception e){finish();}}
  else { web.loadUrl(UrlPolicy.allowed(getIntent().getStringExtra("url"))?getIntent().getStringExtra("url"):"https://www.trendyol.com/"); new Thread(()->{try{quote=AdminPricing.load();}catch(Exception e){runOnUiThread(()->status.setText("تعذر قراءة سعر الصرف والعمولة المعتمدين؛ لن نفترض سعراً. يمكن تجربة البيانات المصطنعة من القائمة الرئيسية."));}},"kinto-public-pricing").start(); }
 }
 private Button button(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);return b;}
 private String asset(String name)throws IOException{try(InputStream in=getAssets().open(name)){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);return new String(bytes.toByteArray(),StandardCharsets.UTF_8);}}
 private void capture(){
  final String url=web.getUrl();if(!UrlPolicy.product(url)){new AlertDialog.Builder(this).setMessage("افتح صفحة منتج أولاً. لم نحفظ شيئاً.").setPositiveButton("حسناً",null).show();return;}
  if(reading||readerScript==null)return;reading=true;status.setText("جاري قراءة بيانات المنتج...");
  web.evaluateJavascript(readerScript,result->{reading=false;
   if(!url.equals(web.getUrl())){status.setText("تغيرت الصفحة؛ اضغط الإضافة من المنتج الجديد");return;}
   try{Object decoded=new JSONTokener(result).nextValue();if(!(decoded instanceof String))throw new JSONException("Missing result");JSONObject item=new JSONObject((String)decoded);
    if(item.has("error")||!url.equals(item.optString("pageUrl")))throw new JSONException("Page mismatch");
    item.put("url",url);item.put("savedAt",System.currentTimeMillis());status.setText("راجع السعر والصورة قبل الحفظ — سلة تجريبية فقط");confirmProduct(item);
   }catch(JSONException e){status.setText("تعذرت قراءة بيانات المنتج؛ لم نحفظ شيئاً. حدّث الصفحة وجرب.");}
  });
 }
 private TextView line(String value){TextView t=new TextView(this);t.setText(value);t.setTextSize(15);t.setPadding(18,8,18,8);return t;}
 private String priceLabel(JSONObject item){double price=item.optDouble("price",Double.NaN);if(!Double.isFinite(price)||price<=0)return "السعر: لم نتمكن من قراءته بثقة";return ("visible-basket-offer".equals(item.optString("priceSource"))?"سعر عرض السلة المرصود: ":"السعر المرصود: ")+String.format(java.util.Locale.US,"%.2f",price)+" ليرة تركية";}
 private void confirmProduct(JSONObject item){
  LinearLayout details=new LinearLayout(this);details.setOrientation(LinearLayout.VERTICAL);
  details.addView(line(item.optString("sourceName","Trendyol")+" — "+item.optString("title")));
  String image=item.optString("image");if(!image.isEmpty()){
   ImageView preview=new ImageView(this);preview.setAdjustViewBounds(true);preview.setScaleType(ImageView.ScaleType.FIT_CENTER);details.addView(preview,new LinearLayout.LayoutParams(-1,Math.round(150*getResources().getDisplayMetrics().density)));loadPreview(image,preview);
  }
  details.addView(line(priceLabel(item)));
  final Pricing.Snapshot snapshot=quote;
  if(!Double.isFinite(item.optDouble("price",Double.NaN))||item.optDouble("price",0)<=0){new AlertDialog.Builder(this).setMessage("السعر غير مؤكد؛ لم نحسب قيمة أو نضف طلباً.").setPositiveButton("حسناً",null).show();return;}
  if(snapshot==null){new AlertDialog.Builder(this).setMessage("لا توجد إعدادات صرف وعمولة متاحة للقراءة. لم نضع أسعاراً افتراضية. استخدم تجربة البيانات المصطنعة من KINTO لاختبار المسار فقط.").setPositiveButton("حسناً",null).show();return;}
  details.addView(line(snapshot.source.equals("synthetic-fixture")?"أسعار اختبار فقط: 50 دينار/ليرة وعمولة 10% — ليست إعدادات الأدمن":"تقدير وفق إعدادات الأدمن المقروءة الآن"));
  details.addView(line("السعر للمنتج فقط، ولا يشمل الشحن. تُحدد تكلفة الشحن بعد مراجعة الموظف للطلب."));
  if("visible-basket-offer".equals(item.optString("priceSource"))){details.addView(line("عرض يُطبق داخل سلة ترنديول؛ يلزم تأكيد استحقاقه والسعر النهائي عند الشراء."));double before=item.optDouble("priceBeforeBasketDiscount",Double.NaN);if(Double.isFinite(before))details.addView(line("قبل خصم السلة: "+String.format(java.util.Locale.US,"%.2f",before)+" ليرة تركية"));}
  if("structured".equals(item.optString("priceSource")))details.addView(line("السعر من بيانات الصفحة؛ طابقه مع السعر الظاهر قبل الحفظ."));
  if("AMBIGUOUS_PRICE".equals(item.optString("warning")))details.addView(line("وجدنا أسعاراً مختلفة؛ لم نعتمد سعراً تلقائياً."));
  JSONObject observed=item.optJSONObject("observedOptions"),required=item.optJSONObject("optionRequirements");
  String observedSize=observed==null?"":observed.optString("size"),observedColor=observed==null?"":observed.optString("color");
  details.addView(line("اختر اللون والمقاس في ترنديول أولاً، ثم طابقهما هنا. الحقول قابلة للتصحيح؛ القراءة التلقائية ما زالت تجريبية."));
  details.addView(line(observedSize.isEmpty()?"المقاس — اكتب المختار إن كان مطلوباً":"المقاس المقروء من الصفحة — طابقه"));
  EditText size=new EditText(this);size.setSingleLine(true);size.setText(observedSize);size.setHint("المقاس أو الحجم؛ فارغ إذا لا يوجد");size.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(60)});details.addView(size);
  details.addView(line(observedColor.isEmpty()?"اللون — اكتب المختار إن كان مطلوباً":"اللون المقروء من الصفحة — طابقه"));
  EditText color=new EditText(this);color.setSingleLine(true);color.setText(observedColor);color.setHint("اللون؛ فارغ إذا لا يوجد");color.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(60)});details.addView(color);
  details.addView(line("الكمية المطلوبة (1–99 للتجربة؛ لا تحقق مخزون)"));
  EditText quantity=new EditText(this);quantity.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);quantity.setSingleLine(true);quantity.setText("1");details.addView(quantity);
  TextView total=line("");details.addView(total);
  quantity.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence t,int a,int c,int f){}public void onTextChanged(CharSequence t,int a,int before,int count){try{total.setText("السعر المحوّل: "+Pricing.total(item.optString("price"),CartRules.quantity(t.toString()),snapshot)+" IQD — بدون الشحن");}catch(IllegalArgumentException e){total.setText("المجموع غير متاح: تحقق من الكمية أو السعر");}}public void afterTextChanged(android.text.Editable e){}});
  try{total.setText("السعر المحوّل: "+Pricing.total(item.optString("price"),1,snapshot)+" IQD — بدون الشحن");}catch(IllegalArgumentException e){total.setText("المجموع غير متاح؛ السعر غير مقروء");}
  CheckBox confirmed=new CheckBox(this);confirmed.setText("طابقت المقاس واللون مع ترنديول، أو المنتج بلا هذه الخيارات");details.addView(confirmed);
  details.addView(line("سيضاف إلى طلب KINTO تجريبي على الجهاز. لا تحقق مخزون ولا إرسال إلى الموظف ولا دفع فعلي."));
  ScrollView scroll=new ScrollView(this);scroll.addView(details);
  AlertDialog dialog=new AlertDialog.Builder(this).setTitle("تأكيد المنتج — تجربة").setView(scroll).setPositiveButton("أؤكد الإضافة إلى الطلب التجريبي",null).setNegativeButton("إلغاء",null).create();
  dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
   String chosenSize=size.getText().toString().trim(),chosenColor=color.getText().toString().trim();
   if(required!=null&&required.optBoolean("size")&&chosenSize.isEmpty()){size.setError("اختر المقاس في ترنديول وأكده هنا");return;}
   if(required!=null&&required.optBoolean("color")&&chosenColor.isEmpty()){color.setError("اختر اللون في ترنديول وأكده هنا");return;}
   if(!confirmed.isChecked()){Toast.makeText(this,"أكد مطابقة الخيارات أولاً",Toast.LENGTH_SHORT).show();return;}
   try{int count=CartRules.quantity(quantity.getText().toString());JSONObject options=new JSONObject();options.put("size",chosenSize);options.put("color",chosenColor);item.put("selectedOptions",options);item.put("quantity",count);item.put("optionsConfirmed",true);item.put("sizeOrigin",!chosenSize.isEmpty()&&chosenSize.equals(observedSize)?"page-confirmed":"user-confirmed");item.put("colorOrigin",!chosenColor.isEmpty()&&chosenColor.equals(observedColor)?"page-confirmed":"user-confirmed");double unit=item.optDouble("price",Double.NaN);item.put("lineTotal",Double.isFinite(unit)&&unit>0?CartRules.total(unit,count):JSONObject.NULL);item.put("cartKey",CartRules.key(item.optString("source"),item.optString("productId"),item.optString("merchantId"),chosenSize,chosenColor));item.put("convertedTotalIQD",Pricing.total(item.optString("price"),count,snapshot));item.put("exchangeRate",snapshot.rate.toPlainString());item.put("commissionPercent",snapshot.commission.toPlainString());item.put("pricingSource",snapshot.source);item.put("testOnly",true);item.put("fixture",fixture);item.put("shipping",JSONObject.NULL);setResult(RESULT_OK,new android.content.Intent().putExtra("product",item.toString()));dialog.dismiss();finish();}catch(IllegalArgumentException e){quantity.setError("أدخل عدداً صحيحاً من 1 إلى 99");}catch(JSONException e){Toast.makeText(this,"تعذر تجهيز التجربة",Toast.LENGTH_SHORT).show();}
  }));dialog.show();
 }
 private void loadPreview(String raw,ImageView target){
  try{java.net.URI u=new java.net.URI(raw);String h=u.getHost();if(!"https".equalsIgnoreCase(u.getScheme())||u.getRawUserInfo()!=null||h==null||(u.getPort()!=-1&&u.getPort()!=443))return;h=h.toLowerCase(java.util.Locale.ROOT);if(!(h.equals("dsmcdn.com")||h.endsWith(".dsmcdn.com")||h.equals("trendyolcdn.com")||h.endsWith(".trendyolcdn.com")||h.equals("trendyol.com")||h.endsWith(".trendyol.com")))return;}catch(Exception e){return;}
  new Thread(()->{java.net.HttpURLConnection c=null;try{c=(java.net.HttpURLConnection)new java.net.URL(raw).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(5000);c.setReadTimeout(5000);if(c.getResponseCode()!=200)return;try(InputStream in=c.getInputStream()){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(bytes.size()+n>2097152)return;bytes.write(b,0,n);}byte[] data=bytes.toByteArray();android.graphics.BitmapFactory.Options o=new android.graphics.BitmapFactory.Options();o.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeByteArray(data,0,data.length,o);o.inSampleSize=1;while(o.outWidth/o.inSampleSize>1000||o.outHeight/o.inSampleSize>1000)o.inSampleSize*=2;o.inJustDecodeBounds=false;android.graphics.Bitmap bitmap=android.graphics.BitmapFactory.decodeByteArray(data,0,data.length,o);if(bitmap!=null)runOnUiThread(()->{if(!isFinishing())target.setImageBitmap(bitmap);});}}catch(Exception ignored){}finally{if(c!=null)c.disconnect();}},"kinto-product-image").start();
 }
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
