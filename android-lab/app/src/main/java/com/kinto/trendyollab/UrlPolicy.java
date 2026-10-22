package com.kinto.trendyollab;
import java.net.URI;
public final class UrlPolicy {
 public static boolean allowed(String raw) {
  try { URI u=new URI(raw); String h=u.getHost(); return "https".equalsIgnoreCase(u.getScheme()) && u.getRawUserInfo()==null && (u.getPort()==-1 || u.getPort()==443) && h!=null && (h.equalsIgnoreCase("trendyol.com") || h.toLowerCase(java.util.Locale.ROOT).endsWith(".trendyol.com")); } catch(Exception e) { return false; }
 }
 public static boolean product(String raw) { try { return allowed(raw) && new URI(raw).getPath().matches(".*-p-[0-9]+(?:/.*)?"); } catch(Exception e) { return false; } }
}
