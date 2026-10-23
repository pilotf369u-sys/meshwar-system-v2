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
  if(!UrlPolicy.product("https://www.zara.com/tr/tr/kinto-p00000001.html?v1=123")||!UrlPolicy.image("https://static.zara.net/assets/test.jpg"))throw new AssertionError("Zara boundary");
  for(String u:new String[]{"https://www.zara.com/us/en/kinto-p00000001.html","https://www.zara.com/tr/tr/category-l1.html","https://zara.com.evil.test/tr/tr/kinto-p00000001.html"})if(UrlPolicy.product(u))throw new AssertionError(u);
  System.out.println("URL policy checks passed");
 }
}
