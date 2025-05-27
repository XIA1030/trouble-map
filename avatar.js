// 1. 替换为你的名字列表
const names = [
    "ゆーたん", "mikan_love", "shun_0410", "りこぴん🍅", "Takumi.S", "あーやん", "natsu_beach", "haru.chan", "kei_works", "momo_xoxo",
    "まっぴー", "しげるん", "riho_rabbit", "YUKI_zZ", "nao.08", "meg_nyan", "kuro🐾", "さとみん", "coffee_lover", "れいれい",
    "daiki__33", "ちかまる", "kazuki_park", "miho✿", "Rina.K", "まこち", "tomo🐻", "nana_073", "KENTA_rock", "さくぴよ",
    "ルカです", "nene_1020", "Shiori🌸", "あっくん", "Aoi_hana", "tetsuya_99", "cocoa🍫", "MAYUchan", "saki_mint", "つばさくん",
    "たろう@大学生", "kanon🎧", "hiroto_n", "ぴかちゅうだよ", "MINAMI*", "Yuna_apple", "genki_desu", "もえもえ", "takachan_7", "しんしん☀️",
    "yuzu_cider", "こはるびより", "aya_0831", "Reo.T", "はるのひ", "chiaki📚", "mocha_latte", "たけのこ派", "runa🐰", "kaito_dayoo",
    "natsuki_desu", "ぱんだぱん", "shiro_ice", "mimi_chan", "daifuku_mochi", "いちご牛乳", "NaNa_s2", "souta_111", "ゆきみだいふく", "anzu_jelly",
    "Riku.JPN", "non_non", "りなてぃー", "こじこじ", "Hikari⭐️", "takoyaki_boy", "マヨラー", "nozomi🌙", "yuuto_desuyo", "えりりん",
    "fuka_smile", "choco🍩", "りゅうた。", "kana_beam", "Leo_2525", "shun_soda", "misaki🌻", "マグロ丼", "hiromu112", "あみごん",
    "さゆゆ", "pino_ice", "meimei🐑", "Sena_R", "おにぎりまん", "honoka_days", "ユウトマン", "cotton_candy", "RisaK", "るんるん",
    "sora_714", "こっぺぱん", "mio_daydream", "junpei_k", "れもん水", "chika_san", "YUKA☆彡", "うめちゃ", "riku🐶", "まひるん",
    "honami.c", "おちゃづけ", "TOMO🐟", "mayutan", "ひかる⭐️", "manami_desu", "niconico☺︎", "ゆうやん", "haruka.love", "ポテチ大好き",
    "arisa_ring", "takuma.88", "るーちゃん", "つなまよ🍙", "Erika_Tokyo", "まこすけ", "shota_bgm", "さきぽよ", "Nana🍓", "けんぴ",
    "cafe_milk", "あやたかくん", "rinrin📎", "けいすけtime", "mikan_cat", "mizuho.3", "ゆうぴよ", "こはねん", "Shin🐢", "ほのぼの",
    "tsubasa_wing", "yuika🎵", "kei._.room", "ちゃんりさ", "はるまき", "なっちゃんです", "minori🌿", "REINA.lol", "しろまる", "Aki🐱"

];

// 2. 头像文件数量（avatar1.png ~ avatar16.png）
const avatarCount = 16;

const result = names.map((name, index) => {
    const avatarFile = `./avatars/avatar${(index % avatarCount) + 1}.png`;
    return { name, avatar: avatarFile };
});

// 3. 导出为 JSON 字符串（复制粘贴到 avatar_list.json 即可）
console.log(JSON.stringify(result, null, 2));
