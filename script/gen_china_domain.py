#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 rule/ChinaDomain.list —— 国内域名大表（ChinaApp 主域之外的卫星/CDN/长尾缺口），DIRECT 兜底。

数据源：blackmatrix7 ChinaMax（Clash 版，Loon 兼容格式）
  https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/ChinaMax/ChinaMax.list

用法（仓库根目录）：
  python3 script/gen_china_domain.py                    # 拉上游生成
  python3 script/gen_china_domain.py --src ChinaMax.list # 用本地文件

设计：
- 上游全量 110k 混垃圾域，且与「微软/苹果/GitHub/哔哩哔哩/抖音」等专门组重合 —— 不整表引用。
- 品牌 token 锚点法：主标签或含锚点的域 + 常见后缀，每组封顶，控制在 ~1-2k 条。
- 有专门策略组的域（微软/苹果/google/github/bilibili/feishu）必须跳过，防止被 DIRECT 抢走。
- 表放在所有专门组之后、China/ChinaIPs/Global 之前。
"""
import re, sys, urllib.request, collections, datetime

SRC_URL = "https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/ChinaMax/ChinaMax.list"
OUT = "rule/ChinaDomain.list"
TLD = r"(com|cn|net|cc|io|org|top|xyz|me|info|vip|site|online|tech|ltd|ink|fun|icu|shop|live|tv|hk|tw|mo)"

# 家族 -> 锚点 token（正则，对域名整体搜）。命中即收。
FAMS = collections.OrderedDict([
 ("腾讯", r"(qlogo|gtimg|qpic|qzone|qqmail|foxmail|tenpay|paipai|weixin|wechat|51241179|myqcloud|tencent|sogou|sgoinput|speedtrial|yuanbao|tencentmusic|qqmusic|kgmusic|webrm|inews|dlied5?|androidola|qqopen|qidian|yyb|tencentads|gtimg-cdn|urlsec|mmopen|qq\.com|qq\.cn)"),
 ("阿里系", r"(taobao|tmall|tbcdn|tb\.cn|tbcity|taobaocdn|t(aobao)?img|aliimg|alipay|alibaba|alicdn|alicloud|aliyun|aliyundrive|alipan|aliexpress|amap|autonavi|1688|cainiao|guoguo|umeng|cnzz|alilang|aliway|alitrip|fliggy|dingtalk|dingguide|lazada|mmstat|tb\.me|aliyuncs|taopiaopiao|damai|xiami)"),
 ("百度系", r"(baidu|bdstatic|bdimg|bcebos|baidubce|haosou|360du|duapps?|nuomi|123s?65|do1duix|dingding|iqire|kanxin|baifendian|71360|buyouqi|shurufa|2345)"),
 ("网易系", r"(163|126|188\.com|yeah\.net|nease|ntes|youdao|lol\.netease|starry|popo|yan\w+121|1(63|88)mail|epay|139mail|163data|163yun|h(erta)?steven)"),
 ("新浪微博", r"(sina|weibo|t\.cn)"),
 ("京东系", r"(360buy|360buyimg|\bjd\b|3\.cn|jrting|jcloud|jdcloud|yiyaojd|jdwl|jd\.global|jd\.tw|jd\.hk|jd\.london|jd\.pay|joyu|jdtest|taoscm)"),
 ("拼多多系", r"(pinduoduo|yangkeduo|pddpic|pdd\.so|100000221)"),
 ("小米系", r"(xiaomi|miui|mijia|mihome|miwifi|miwork|mishop|migumip|miphone|duokan|mi\.com|mi\.cn|mi\.test|mioffice|xiaomoyi|xiaomiao|1nami|mihealth|miaostore|jielong|miwushan)"),
 ("华为荣耀", r"(huawei|huaweicloud|vmall|hicloud|hihonor|hihealth|hihope|appgallery|pullnewapp|dratio|petal|dbank|hicar|we-link|huaweisymantec)"),
 ("OV系", r"(oppo|heytap|myoppo|realme|vivo|vivogame|vivotc|vivojrkj|bbktel|bbk|imobile)"),
 ("魅族系", r"(meizu|flyme|mzwukong|meizuhub)"),
 ("美团系", r"(meituan|sankuai|dianping|maoyan|mtyun|neixin|ksapisrv|555dy)"),
 ("携程系", r"(ctrip|tripcdn|qunar|dafengxiang|alibtrip|trip\.com|ctripbus|zuoshouyoubao)"),
 ("视频系", r"(iqiyi|qiyi|qiyipic|pps|youku|soku|cibntv|mgtv|hunantv|kankan|le\.com|letv|sogou-vedio|pptv|wasu|1905|migu(video|vision)?|liveu|myuncai|otv|sohu|tudou|funshion|hitv|ysten)"),
 ("音乐系", r"(kugou|kuwo|xiami|yimixun|lrts|ximalaya|xima|lizhi|qingting|ting\.fm|f(m)?\.|music\d+|musicatlas|mlog|songtaste)"),
 ("支付清算", r"(unionpay|up996|up36|955\d\d|95105|95013|abchina|icbc|ccb(-)?|boc\.cn|spdb|ecitic|citicbank|bankcomm|psbc|cmbchina|cmbimg|cmburl|95588|95566|95555|95568|95577|95599|95508|cup\.cn|jdpay|99bill|yeepay|chinapay|allinpay)"),
 ("运营商", r"(10010|189\.cn|g139|monternet|189abc|wo\.cn|10086|chinamobile|chinaunicom|chinatelecom|ctwing|ali10010|unicompay)"),
 ("快递物流", r"(sf-express|sf-tech|sfjdl|kuaidi100|jtexpress|yto|zto|sto(cn|-)|yunda|bestex|11185|ems|cainiao|jtjmsz|56|jdwl|deppon|ane|ykc)"),
 ("安全厂商", r"(360(tp|plus|safe|insitu|sd)?|qh360|qhimg|qhres|qhmsg|qihoo|360safe|360insur|qihoo|ikxing|qihu|360cn|secpass|tophub)"),
 ("云盘阅读", r"(weiyun|lanzou|ilanzou|123pan|123865|123claw|pikpak|pikpaker|yescanner|shuqi|ishuqi|sqreader|uc\.cn|ucweb|myuc|quark|sm\.cn|tianyi|139mail|189pan|alipan)"),
 ("游戏系", r"(mihoyo|sr-offline|hoyoverse|hypergfx|crylink|leroymerlin|xd\.com|xd\.games|37play|37wan|37g|4399|3839|wandoujia|taptap|veryzhun|ali213|gamersky|17173|youmeng|ppmac|wuxia|jiale|37tj)"),
 ("政务媒体", r"(12306|people(daily)?|xinhuanet|cctv|cgtn|gmw|ce\.cn|chinadaily|cri|cyol|youth|gov\.cn|12377|12348|chsi|ncss|stats|ndrc|customs|chinatax|12366|gds|guizhengtu)"),
 ("出行航司", r"(caair|airchina|ceair|csair|nads|tripair|ihg|marriott|hyatt|accor|jinjianghotel|btghotels|huazhu|bestone|95013|feizhu)"),
 ("办公学习", r"(shimo|yuque|kingsoft|ksurl|wps|docer|ibeta|do(ing)?cct|ironer|quickbird|shanbay|baicizhan|koolearn|xuexi|zhan\.to|fayea|91|eol|51test|neea|chsi|fenbi|hujiang|51testing|testin)"),
 ("招聘房产", r"(zhaopin|51job|liepin|zhipin|lagou|kanzhun|58\.com|58cdn|ganji|anjuke|lianjia|beike|ke\.com|fang\.com|leju|sofang|qunar-house)"),
 ("字节国内", r"(douyin|iesdouyin|douyincdn|douyinstatic|douyinliving|snssdk|byted|toutiao|ixigua|pstatp|xingtu|toutiaohao)"),
])

# 数字开头的域名一律视为垃圾注册域；白名单例外（数字开头的正经主域）
NUM_JUNK = re.compile(r"^\d")
NUM_OK = {
    "001pp.com", "10010.com", "10010.net", "11185.cn", "12306.cn", "12306.com",
    "12366.cn", "12366.com", "12377.cn", "12348.org", "126.net", "126.com",
    "127.net", "128shows.com", "139.com", "139mail.com", "163.com", "163yun.com",
    "163data.com.cn", "1688.com", "17173.com", "17u.cn", "189.cn", "189pay.com",
    "188.com", "1nn321-c.xyz", "2345.com", "2345.cn", "3.cn", "3155.com",
    "3533.com", "360.cn", "360.com", "360buy.com", "360buyimg.com", "360buyimg.com.cn",
    "37.com", "3dmgame.com", "4399.com", "4399.cn", "51.la", "51job.com",
    "51testing.com", "555dy.com", "56.com", "58.com", "58cdn.com.cn",
    "6166.com", "66668888.com", "71360.com", "818tc.com", "91.com", "95013.com",
    "95508.com", "95516.com", "95528.com", "95533.com", "95555.com", "95566.com",
    "95568.com", "95577.com", "95588.com", "95599.cn", "95599.com", "96662.com",
    "99bill.com", "9game.cn",
}

# 核心域名：人工核对的确定直连域（上游 ChinaMax 缺失，或按字母序封顶被截断的大厂主/CDN 域）
CORE = [
    # 腾讯
    "qlogo.cn", "qpic.cn", "qzone.com", "tenpay.com", "sogou.com", "myqcloud.com",
    # 阿里
    "tbcdn.cn", "mmstat.com", "taobaocdn.com", "amap.com", "autonavi.com",
    # 新浪微博
    "weibo.cn", "sinaimg.cn", "sina.cn",
    # 京东
    "3.cn",
    # 小米 / 华为
    "mijia.com", "miwifi.com", "mi.com", "hicloud.com", "vmall.com",
    # 携程 / 视频 / 音乐
    "ctrip.com.cn", "mgtv.com", "kugou.net", "kuwo.cn", "ximalaya.com",
    # 支付 / 运营商
    "unionpay.com", "189.cn", "g139.cn", "10086.cn",
    # 快递
    "sf-express.com", "kuaidi100.com",
    # 安全
    "360.cn", "qhimg.com", "qhres.com",
    # 云盘
    "quark.cn", "sm.cn",
    # 政务媒体
    "12306.cn", "people.cn", "xinhuanet.com",
    # 办公 / 招聘房产
    "yuque.com", "wps.cn", "zhipin.com", "lianjia.com",
    # 字节
    "snssdk.com", "iesdouyin.com", "douyin.com",
]

# 有专门策略组或刻意走代理 —— 一律不进 DIRECT 大表
SKIP = re.compile(
    r"(microsoft|msftconnecttest|msftncsi|live\.com|outlook|skype|github|gitlab|gitee|"
    r"apple\.com|(^|\.)icloud|mzstatic|aaplimg|itunes|google|gstatic|gmail|youtube|ggpht|"
    r"doubleclick|admob|faceb|fb\.com|instagram|whatsapp|telegram|twitter|(?<!\w)t\.co(?!\w)|x\.com|"
    r"amazon|aws|cloudfront|fastly|cloudflare|cdn\.js|feishu|larksuite|chatgpt|openai|"
    r"steampowered|steamcommunity|epicgames|playstation|xbox|nintendo|battle\.net|blizzard|"
    r"discord|notion\.so|linear\.app|vercel|netlify|supabase|"
    r"bilibili|hdslb|biliintl|bilibiligame)", re.I)

# CN 系顶级域（上游 China.list 只有 cn/ms）
CN_TLDS = ["com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn", "mil.cn",
           "中国", "公司", "网络", "网址", "商标"]

CAP = 250  # 每组封顶


def load(path=None):
    if path:
        raw = open(path, encoding="utf-8").read()
    else:
        req = urllib.request.Request(SRC_URL, headers={"User-Agent": "curl/8"})
        raw = urllib.request.urlopen(req, timeout=180).read().decode("utf-8", "replace")
    out = []
    for l in raw.splitlines():
        l = l.strip()
        if l.startswith("DOMAIN-SUFFIX,"):
            out.append(l.split(",", 1)[1].lower())
    return sorted(set(out))


def main():
    src = None
    if "--src" in sys.argv:
        src = sys.argv[sys.argv.index("--src") + 1]
    ds = load(src)
    print(f"上游 DOMAIN-SUFFIX: {len(ds)}")

    picked = collections.OrderedDict()
    taken = set()

    # 第一轮：核心域名无条件入表（仍受 SKIP 约束）
    core = [d for d in CORE if not SKIP.search(d)]
    taken.update(core)
    picked["核心补齐"] = core
    core_missing = [d for d in CORE if SKIP.search(d)]
    if core_missing:
        print(f"警告: 核心域被 SKIP 拦下 {core_missing}")

    for fam, pat in FAMS.items():
        rx = re.compile(pat)
        hits = []
        for d in ds:
            if d in taken or SKIP.search(d):
                continue
            if d.count(".") > 2:      # 排除三级以上长尾
                continue
            if NUM_JUNK.search(d) and d not in NUM_OK:   # 数字开头垃圾域
                continue
            if rx.search(d):
                hits.append(d); taken.add(d)
                if len(hits) >= CAP:
                    break
        if hits:
            picked[fam] = hits
    total = sum(len(v) for v in picked.values())
    print(f"挑选 {total} 条 / {len(picked)} 家族")

    # 自检：专门组域名绝不能进表
    for must_not in ("google.com", "apple.com", "github.com", "microsoft.com",
                     "feishu.cn", "bilibili.tv"):
        bad = [d for v in picked.values() for d in v if d == must_not]
        assert not bad, f"自检失败: {must_not} 进了 DIRECT 表"

    today = datetime.date.today().isoformat()
    lines = [
        "# NAME: ChinaDomain",
        "# DESC: 国内域名大表（品牌卫星/CDN 域 + CN 系顶级域），DIRECT 兜底，补 ChinaApp 主域之外的缺口",
        "# USAGE: 排在所有专门策略组之后、China/ChinaIPs/Global 之前；policy=DIRECT",
        "# SYNC: python3 script/gen_china_domain.py  (blackmatrix7 ChinaMax 品牌锚点精选, 非整表引用)",
        f"# UPDATED: {today}",
        "#" * 45, "",
    ]
    for fam, hits in picked.items():
        lines.append(f"# ---- {fam} ----")
        lines += [f"DOMAIN-SUFFIX,{d}" for d in sorted(hits)]
        lines.append("")
    lines.append("# ---- CN 系顶级域（上游 China.list 只有 cn/ms）----")
    lines += [f"DOMAIN-SUFFIX,{t}" for t in CN_TLDS]
    lines.append("")
    open(OUT, "w", encoding="utf-8").write("\n".join(lines))
    import os
    print(f"写入 {OUT}: {total + len(CN_TLDS)} 条, {os.path.getsize(OUT)/1024:.0f} KB")


if __name__ == "__main__":
    main()
