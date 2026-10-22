import com.kinto.trendyollab.Pricing;
public class PricingCheck {
 static void deny(Runnable r){try{r.run();throw new AssertionError("must deny");}catch(IllegalArgumentException expected){}}
 public static void main(String[] a){var p=new Pricing.Snapshot("50","10","synthetic-fixture");if(!Pricing.total("100",2,p).equals("11000"))throw new AssertionError();if(!Pricing.total("0.01",1,p).equals("1"))throw new AssertionError();deny(()->Pricing.total("NaN",1,p));deny(()->Pricing.total("0",1,p));deny(()->Pricing.total("100",100,p));deny(()->new Pricing.Snapshot("0","10","x"));deny(()->new Pricing.Snapshot("50","-1","x"));System.out.println("Pricing fixture totals, rounding, quantities and invalid input passed; shipping excluded");}
}
