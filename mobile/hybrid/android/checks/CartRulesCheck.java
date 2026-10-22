import com.kinto.trendyollab.CartRules;
public class CartRulesCheck {
 public static void main(String[] args){
  if(CartRules.quantity("2")!=2||!CartRules.total(246.84,2).equals("493.68"))throw new AssertionError("quantity/total");
  for(String q:new String[]{"0","-1","1.5","100","","01"}){try{CartRules.quantity(q);throw new AssertionError(q);}catch(IllegalArgumentException expected){}}
  String a=CartRules.key("trendyol","123","5","M","blue"),b=CartRules.key("trendyol","123","5","L","blue"),c=CartRules.key("trendyol","123","6","M","blue");
  if(a.equals(b)||a.equals(c)||!a.equals(CartRules.key("Trendyol","123","5"," m ","BLUE")))throw new AssertionError("variant identity");
  try{CartRules.total(Double.NaN,1);throw new AssertionError("unknown price");}catch(IllegalArgumentException expected){}
  System.out.println("Cart quantity, exact totals and variant identity checks passed");
 }
}
