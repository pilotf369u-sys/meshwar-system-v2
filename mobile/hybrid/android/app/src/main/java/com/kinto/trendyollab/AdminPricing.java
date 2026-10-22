package com.kinto.trendyollab;
import org.json.*;import java.net.*;import java.io.*;
public final class AdminPricing {
 private static final String ROOT="https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/kinto_global_pricing_read_v1";
 private static final String KEY="sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH";
 public static Pricing.Snapshot load()throws Exception{
  HttpURLConnection c=(HttpURLConnection)new URL(ROOT).openConnection();c.setRequestMethod("POST");c.setDoOutput(true);c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setRequestProperty("apikey",KEY);c.setRequestProperty("Content-Type","application/json");
  try{try(OutputStream out=c.getOutputStream()){out.write(new byte[]{'{','}'});}if(c.getResponseCode()!=200)throw new IOException("Pricing unavailable");
   try(InputStream in=c.getInputStream()){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] b=new byte[2048];int n;while((n=in.read(b))!=-1){if(bytes.size()+n>65536)throw new IOException("Too large");bytes.write(b,0,n);}return parse(new JSONObject(bytes.toString("UTF-8")));}
  }finally{c.disconnect();}
 }
 public static Pricing.Snapshot parse(JSONObject doc)throws Exception{
  if(doc.getInt("schema_version")!=1||!doc.getBoolean("enabled")||!"usd_cross_markup_v1".equals(doc.getString("formula"))||doc.getBoolean("shipping_included"))throw new IOException("Unapproved configuration");
  String target=doc.getString("display_currency"),fromRate=null,toRate=null;JSONArray currencies=doc.getJSONArray("currencies");java.util.HashSet<String> codes=new java.util.HashSet<>();boolean usd=false;
  if(currencies.length()<1||currencies.length()>50)throw new IOException("Invalid currencies");
  for(int i=0;i<currencies.length();i++){JSONObject row=currencies.getJSONObject(i);String code=row.getString("code"),rate=row.getString("per_usd");if(!codes.add(code)||!code.matches("[A-Z]{3}"))throw new IOException("Duplicate currency");new Pricing.Snapshot("1",rate,"0","USD",code,"validation",0);if(code.equals("USD")){if(new java.math.BigDecimal(rate).compareTo(java.math.BigDecimal.ONE)!=0)throw new IOException("USD must be one");usd=true;}if(code.equals("TRY"))fromRate=rate;if(code.equals(target))toRate=rate;}
  if(!usd||fromRate==null||toRate==null)throw new IOException("Missing currency");
  return new Pricing.Snapshot(fromRate,toRate,doc.getString("commission_percent"),"TRY",target,"admin-global-v1",doc.getLong("revision"));
 }
}
