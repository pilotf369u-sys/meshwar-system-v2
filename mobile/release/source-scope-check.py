"""Verify Java token scope against accepted28, allowing only equal orientation constants."""
import hashlib,json,pathlib,re
root=pathlib.Path(__file__).resolve().parents[2]
def digest(text):
 text=text.replace('.setOrientation(LinearLayout.VERTICAL)','.setOrientation(1)')
 tokens=re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S',text)
 return hashlib.sha256('\0'.join(t for t in tokens if not t.startswith(('//','/*'))).encode()).hexdigest()
if __name__=='__main__':
 baseline=json.loads((root/'mobile/release/accepted28-java-logic.sha256.json').read_text())
 for relative,value in baseline.items():assert digest((root/relative).read_text())==value,relative
 print('PASS_JAVA_SCOPE: all accepted28 Java tokens unchanged except equal VERTICAL=1 naming and whitespace')
