import com.kinto.trendyollab.UrlPolicy;
public class UrlPolicyCheck {
 public static void main(String[] args){
  String[] good={"https://www.trendyol.com/","https://trendyol.com/a-p-123","https://m.trendyol.com/a-p-456?x=1"};
  String[] bad={"http://www.trendyol.com/a-p-1","https://trendyol.com.evil.test/a-p-1","https://eviltrendyol.com/a-p-1","https://user@trendyol.com/a-p-1","javascript:alert(1)","file:///a-p-1","https://trendyol.com:444/a-p-1"};
  for(String u:good)if(!UrlPolicy.allowed(u))throw new AssertionError(u);
  for(String u:bad)if(UrlPolicy.allowed(u))throw new AssertionError(u);
  if(UrlPolicy.product(good[0])||!UrlPolicy.product(good[1])||!UrlPolicy.product(good[2]))throw new AssertionError("product gate");
  String[] hepsi={"https://www.hepsiburada.com/test-p-HBCV000001", "https://hepsiburada.com/test-pm-HBC000001?magaza=TEST", "https://m.hepsiburada.com/test-p-HBV000001/"};
  for(String u:hepsi)if(!UrlPolicy.product(u)||!UrlPolicy.source(u).equals("hepsiburada"))throw new AssertionError(u);
  String[] blocked={"https://hepsiburada.com.evil.test/test-p-HBCV1","https://user@www.hepsiburada.com/test-p-HBCV1","https://www.hepsiburada.com:444/test-p-HBCV1","http://www.hepsiburada.com/test-p-HBCV1","https://checkout.hepsiburada.com/test-p-HBCV1","https://shopkinto.com/test-p-HBCV1"};
  for(String u:blocked)if(UrlPolicy.allowed(u))throw new AssertionError(u);
  if(UrlPolicy.product("https://www.hepsiburada.com/ara?q=test")||UrlPolicy.product("https://www.hepsiburada.com/a-p-/"))throw new AssertionError("Hepsi non-product");
  if(!UrlPolicy.image("https://productimages.hepsiburada.net/s/test.jpg")||UrlPolicy.image("https://productimages.hepsiburada.net.evil.test/a.jpg")||UrlPolicy.image("https://user@productimages.hepsiburada.net/a.jpg")||UrlPolicy.image("https://productimages.hepsiburada.net:444/a.jpg"))throw new AssertionError("Hepsi image boundary");
  if(!UrlPolicy.product("https://www.zara.com/tr/tr/test-p00000001.html?v1=123")||!UrlPolicy.source("https://zara.com/tr/tr/").equals("zara"))throw new AssertionError("Zara product");
  for(String raw:new String[]{"https://www.zara.com/us/en/test-p00000001.html","https://www.zara.com/tr/tr/man-l737.html","https://www.zara.com/tr/tr/test-p123.html"})if(UrlPolicy.product(raw))throw new AssertionError(raw);
  for(String raw:new String[]{"http://www.zara.com/tr/tr/","https://www.zara.com.evil.test/tr/tr/","https://user@www.zara.com/tr/tr/","https://www.zara.com:444/tr/tr/"})if(UrlPolicy.allowed(raw))throw new AssertionError(raw);
  if(!UrlPolicy.image("https://static.zara.net/assets/test.jpg")||UrlPolicy.image("https://static.zara.net.evil.test/assets/test.jpg")||UrlPolicy.image("https://static.zara.net/stdstatic/app.js"))throw new AssertionError("Zara image");
  if(!UrlPolicy.readerMatches("https://www.zara.com/tr/tr/a-p00000001.html?v1=123","https://www.zara.com/tr/tr/other-slug-p00000001.html?v1=123"))throw new AssertionError("Zara identity binding");
  if(UrlPolicy.readerMatches("https://www.zara.com/tr/tr/a-p00000001.html?v1=123","https://www.zara.com/tr/tr/a-p00000001.html?v1=456")||UrlPolicy.readerMatches("https://www.zara.com/tr/tr/a-p00000001.html?v1=123","https://www.zara.com/tr/tr/a-p00000002.html?v1=123"))throw new AssertionError("Zara variant identity");
  System.out.println("URL policy checks passed");
 }
}
