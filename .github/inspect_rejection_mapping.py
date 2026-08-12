from pathlib import Path
for fn in ['admin-dashboard.html','employee-dashboard.html','branch-dashboard.html']:
    s=Path(fn).read_text(encoding='utf-8')
    print('\n===== '+fn+' =====')
    terms=['رفض الطلب','مرفوض','رفض التسليم','راجع','rejection_reason','adminOrdersTableBody','employeeOrdersTableBody','pipeline','status']
    seen=[]
    for term in terms:
        start=0
        count=0
        while count<4:
            i=s.find(term,start)
            if i<0: break
            key=(term,i)
            if key not in seen:
                print(f'\n--- {term} @ {i} ---\n{s[max(0,i-1200):min(len(s),i+2600)]}')
                seen.append(key)
            start=i+len(term); count+=1
