import com.kinto.trendyollab.UrlPolicy;
public class UrlPolicyCheck {
 public static void main(String[] args){
  String[] good={"https://www.trendyol.com/","https://trendyol.com/a-p-123","https://m.trendyol.com/a-p-456?x=1"};
  String[] bad={"http://www.trendyol.com/a-p-1","https://trendyol.com.evil.test/a-p-1","https://eviltrendyol.com/a-p-1","https://user@trendyol.com/a-p-1","javascript:alert(1)","file:///a-p-1","https://trendyol.com:444/a-p-1"};
  for(String u:good)if(!UrlPolicy.allowed(u))throw new AssertionError(u);
  for(String u:bad)if(UrlPolicy.allowed(u))throw new AssertionError(u);
  if(UrlPolicy.product(good[0])||!UrlPolicy.product(good[1])||!UrlPolicy.product(good[2]))throw new AssertionError("product gate");
  System.out.println("URL policy checks passed");
 }
}
