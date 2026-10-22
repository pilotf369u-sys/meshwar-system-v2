package com.kinto.trendyollab;
import java.math.*;
public final class Pricing {
 public static final class Snapshot {
  public final BigDecimal rate,commission,sourcePerUsd,targetPerUsd;
  public final String source,fromCurrency,toCurrency;public final long revision;
  // Retain the old synthetic-only direct-rate checks; live settings always use the cross-rate constructor.
  public Snapshot(String r,String c,String s){this("1",r,c,"TRY","IQD",s,0);}
  public Snapshot(String a,String b,String c,String from,String to,String origin,long version){
   sourcePerUsd=decimal(a,8);targetPerUsd=decimal(b,8);commission=decimal(c,6);
   if(sourcePerUsd.signum()<=0||targetPerUsd.signum()<=0||commission.signum()<0||commission.compareTo(new BigDecimal("100"))>0||!from.matches("[A-Z]{3}")||!to.matches("[A-Z]{3}")||version<0)throw new IllegalArgumentException("Invalid pricing");
   fromCurrency=from;toCurrency=to;source=origin;revision=version;rate=targetPerUsd.divide(sourcePerUsd,24,RoundingMode.HALF_UP);
  }
 }
 private static BigDecimal decimal(String text,int scale){if(text==null||!text.matches("[0-9]{1,13}(\\.[0-9]{1,"+scale+"})?"))throw new IllegalArgumentException("Invalid decimal");BigDecimal d=new BigDecimal(text);if(d.compareTo(new BigDecimal("1000000000000"))>0)throw new IllegalArgumentException("Too large");return d;}
 public static String total(String raw,int quantity,Snapshot s){
  BigDecimal price=decimal(raw,8);if(price.signum()<=0||quantity<1||quantity>99||s==null)throw new IllegalArgumentException("Unknown price");
  return price.multiply(BigDecimal.valueOf(quantity)).multiply(s.targetPerUsd).multiply(new BigDecimal("100").add(s.commission)).divide(s.sourcePerUsd.multiply(new BigDecimal("100")),s.toCurrency.equals("IQD")?0:2,RoundingMode.CEILING).toPlainString();
 }
}
