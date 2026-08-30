from pathlib import Path
p=Path('dashboard.html')
s=p.read_text(encoding='utf-8')
tag='    <link rel="stylesheet" href="css/customer-mobile-cards-v46.css?v=20260830-mobile-v46">\n'
needle='    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">\n'
assert needle in s
assert 'customer-mobile-cards-v46.css' not in s
s=s.replace(needle,needle+tag,1)
p.write_text(s,encoding='utf-8')
