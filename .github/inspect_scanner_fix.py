from pathlib import Path
import re
for fn in ['admin-dashboard.html','employee-dashboard.html','branch-dashboard.html']:
    s=Path(fn).read_text(encoding='utf-8')
    print('\n===== '+fn+' =====')
    for term in ['dashboardScanner','startDashboardCameraScanner','stopDashboardCameraScanner','startCameraScanner','closeCameraScanner','Html5Qrcode']:
        i=s.find(term)
        if i>=0:
            print('\n--- '+term+' ---\n'+s[max(0,i-1200):min(len(s),i+4500)])
# trigger
