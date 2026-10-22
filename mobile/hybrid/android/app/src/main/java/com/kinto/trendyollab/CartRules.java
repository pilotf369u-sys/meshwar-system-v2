package com.kinto.trendyollab;
import java.math.BigDecimal;
import java.math.RoundingMode;
public final class CartRules {
 public static int quantity(String raw){if(raw==null||!raw.trim().matches("[1-9][0-9]?"))throw new IllegalArgumentException("Quantity must be 1-99");return Integer.parseInt(raw.trim());}
 private static String clean(String value){return (value==null?"":value).trim().replaceAll("[\\p{Cntrl}]","").toLowerCase(java.util.Locale.ROOT);}
 public static String key(String source,String product,String seller,String size,String color){return clean(source)+"\u001f"+clean(product)+"\u001f"+clean(seller)+"\u001f"+clean(size)+"\u001f"+clean(color);}
 public static String total(double unit,int quantity){if(!Double.isFinite(unit)||unit<=0||quantity<1||quantity>99)throw new IllegalArgumentException("Invalid amount");return BigDecimal.valueOf(unit).multiply(BigDecimal.valueOf(quantity)).setScale(2,RoundingMode.HALF_UP).toPlainString();}
}
