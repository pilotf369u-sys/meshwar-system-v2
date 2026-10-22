package com.kinto.trendyollab;
import org.json.*;import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;
public final class AdminPricing {
 private static final boolean LIVE_PRICE_CONTRACT_VERIFIED=false;
 private static final String ROOT="https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/";
 private static final String KEY="sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH";
 private static JSONArray read(String path)throws Exception{
  HttpURLConnection c=(HttpURLConnection)new URL(ROOT+path).openConnection();c.setRequestMethod("GET");c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setRequestProperty("apikey",KEY);
  try{if(c.getResponseCode()!=200)throw new IOException("Pricing unavailable");try(InputStream in=c.getInputStream()){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[2048];int n;while((n=in.read(b))!=-1){if(out.size()+n>65536)throw new IOException("Too large");out.write(b,0,n);}return new JSONArray(out.toString(StandardCharsets.UTF_8.name()));}}finally{c.disconnect();}
 }
 public static Pricing.Snapshot load()throws Exception{
  JSONArray rates=read("currencies?select=name,rate&limit=1000"),settings=read("settings?select=key,value&key=eq.site_commission");String rate=null,commission=null;int found=0;
  for(int i=0;i<rates.length();i++){JSONObject r=rates.getJSONObject(i);String name=r.optString("name").trim();if(name.equalsIgnoreCase("TRY")||name.equalsIgnoreCase("TL")){rate=r.getString("rate");found++;}}
  if(found!=1||settings.length()!=1)throw new IOException("No unique approved pricing");commission=settings.getJSONObject(0).getString("value");if(!LIVE_PRICE_CONTRACT_VERIFIED)throw new IOException("Global rate direction/formula is not verified");return new Pricing.Snapshot(rate,commission,"admin-public-read");
 }
}
