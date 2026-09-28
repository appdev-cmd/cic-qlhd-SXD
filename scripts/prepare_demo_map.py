"""Create a small public-domain geographic context layer for offline demos."""
import hashlib,json,urllib.request
from pathlib import Path
url='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
raw=urllib.request.urlopen(url,timeout=45).read()
source=json.loads(raw)
codes={'VNM','LAO','CHN','THA','KHM','MMR'}
features=[]
for f in source['features']:
    if f['properties'].get('ADM0_A3') in codes:
        f['properties']={'name':f['properties'].get('NAME_VI') or f['properties'].get('NAME'),'code':f['properties']['ADM0_A3']}
        features.append(f)
root=Path(__file__).resolve().parents[1]/'public/maps';root.mkdir(parents=True,exist_ok=True)
(root/'regional-context.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(root/'SOURCE.md').write_text('# Nền địa lý ngoại tuyến\n\nNguồn: '+url+'\n\nNatural Earth 1:50m; public domain: https://www.naturalearthdata.com/about/terms-of-use/\n\nSHA256 bản nguồn: '+hashlib.sha256(raw).hexdigest()+'\n\nChỉ dùng nền địa lý khái quát cho demo; không phải bản đồ địa chính, địa giới hành chính chính thức hoặc quy hoạch. Lọc sáu quốc gia để giảm dung lượng, giữ nguyên hình học.\n',encoding='utf-8')
print('Offline geographic layer ready:',len(features),'features')
