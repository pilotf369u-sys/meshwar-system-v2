#!/usr/bin/env python3
"""Read-only, fail-closed regression checks for KINTO Android support and Play updates."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
java=root/"app/src/main/java/com/kinto/trendyollab"
main=(java/"MainActivity.java").read_text()
shop=(java/"ShoppingActivity.java").read_text()
support=(java/"KintoShopSupport.java").read_text()
updates=(java/"KintoPlayUpdates.java").read_text()
manifest=(root/"app/src/main/AndroidManifest.xml").read_text()
gradle=(root/"app/build.gradle").read_text()
assert 'if("https".equals(s)&&"wa.me".equalsIgnoreCase(x.getHost())' in main
assert 'x.getPath().matches("/[1-9][0-9]{8,14}/?")' in main
assert 'new AlertDialog.Builder(this).setMessage("فتح الرابط خارج التطبيق؟' in main
assert 'KintoShopSupport.install(this,root)' in shop
assert 'android:process=":shopping"' in manifest
assert 'setAcceptThirdPartyCookies(web,false)' in shop
assert 'setAllowFileAccess(false)' in shop
assert 'setAllowContentAccess(false)' in shop
assert 'new Intent(Intent.ACTION_VIEW,Uri.parse(url))' in support
assert 'get_site_settings' in support and 'whatsapp_active' in support
assert '.matches("[1-9][0-9]{8,14}")' in support
assert 'com.google.android.play:app-update:2.1.0' in gradle
assert 'AppUpdateType.FLEXIBLE' in updates
assert 'manager.completeUpdate()' in updates
assert 'manager.unregisterListener(listener)' in updates
assert 'onResume(){super.onResume();if(playUpdates!=null)playUpdates.onResume();}' in main
assert 'if(playUpdates!=null)playUpdates.onDestroy()' in main
assert 'customer_cart_' not in support and 'customer_cart_' not in updates
print("PASS: native support, isolation, Play update and external link contracts")
