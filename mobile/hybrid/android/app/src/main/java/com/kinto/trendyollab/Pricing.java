package com.kinto.trendyollab;
import java.math.*;
public final class Pricing {
 public static final class Snapshot {
  public final BigDecimal rate,commission;public final String source;
  public Snapshot(String r,String c,String s){rate=new BigDecimal(r);commission=new BigDecimal(c);source=s;if(rate.signum()<=0||commission.signum()<0||commission.compareTo(new BigDecimal("100"))>0)throw new IllegalArgumentException("Invalid pricing");}
 }
 public static String total(String raw,int quantity,Snapshot s){
  BigDecimal price=new BigDecimal(raw);if(price.signum()<=0||quantity<1||quantity>99||s==null)throw new IllegalArgumentException("Unknown price");
  return price.multiply(BigDecimal.valueOf(quantity)).multiply(s.rate).multiply(BigDecimal.ONE.add(s.commission.movePointLeft(2))).setScale(0,RoundingMode.CEILING).toPlainString();
 }
}
