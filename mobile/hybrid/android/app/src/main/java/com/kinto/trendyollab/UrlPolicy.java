package com.kinto.trendyollab;
import java.net.URI;
import java.util.Locale;
public final class UrlPolicy {
 private static URI secure(String raw)throws Exception {URI u=new URI(raw);if(!"https".equalsIgnoreCase(u.getScheme())||u.getRawUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=443)||u.getHost()==null)throw new IllegalArgumentException();return u;}
 public static String source(String raw){try{String h=secure(raw).getHost().toLowerCase(Locale.ROOT);if(h.equals("trendyol.com")||h.endsWith(".trendyol.com"))return "trendyol";if(h.equals("hepsiburada.com")||h.equals("www.hepsiburada.com")||h.equals("m.hepsiburada.com"))return "hepsiburada";if(h.equals("zara.com")||h.equals("www.zara.com"))return "zara";}catch(Exception ignored){}return "";}
 public static boolean allowed(String raw){return !source(raw).isEmpty();}
 public static boolean product(String raw){try{String source=source(raw),path=secure(raw).getPath();return source.equals("trendyol")?path.matches(".*-p-[0-9]+(?:/.*)?"):source.equals("zara")?path.matches("^/tr/tr/[^/]+-p[0-9]{8}\\.html$"):source.equals("hepsiburada")&&path.matches(".*-(?:p|pm)-[A-Za-z0-9]{3,40}/?");}catch(Exception e){return false;}}
 public static boolean image(String raw){try{String h=secure(raw).getHost().toLowerCase(Locale.ROOT);return (h.equals("static.zara.net")&&secure(raw).getPath().startsWith("/assets/"))||h.equals("productimages.hepsiburada.net")||h.equals("dsmcdn.com")||h.endsWith(".dsmcdn.com")||h.equals("trendyolcdn.com")||h.endsWith(".trendyolcdn.com")||h.equals("trendyol.com")||h.endsWith(".trendyol.com");}catch(Exception e){return false;}}
}
