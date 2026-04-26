import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC5S0_zRjNF_Oz65ch3IepPBBa6BUuYMuw",
    authDomain: "trouble-map-84582.firebaseapp.com",
    projectId: "trouble-map-84582",
    storageBucket: "trouble-map-84582.firebasestorage.app",
    messagingSenderId: "717092321622",
    appId: "1:717092321622:web:5bf196a300084161973ef7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// main.js - 発問者表示機能（固定ユーザー名とアイコン）追加

let map;
let currentPattern = 'pattern1';
let currentCondition = 'noHint';
let allMarkers = [];
let activeInfoWindow = null;
let selectedMarkers = [];
let avatarMap = {}; // ID → {name, avatar}
// === 現在地表示用 ===
let myPosMarker = null;       // 現在地マーカー
let myAccuracyCircle = null;  // 位置精度円
let geoWatchId = null;        // watchPosition のID
let firstFix = true;          // 最初の測位で地図を寄せる
// 👇 逻辑聚类用的全局表
let clusters = [];                 // [{id: 0, type: 'xxx', members: [marker, ...]}, ...]
let markerIdToClusterId = {};      // { marker.customData.id : clusterId }

let userId = localStorage.getItem("experiment_user_id");

if (!userId) {
    userId = "U_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    localStorage.setItem("experiment_user_id", userId);
}

async function logEvent(eventType, postId = null, extraInfo = {}) {
    try {
        await addDoc(collection(db, "user_events"), {
            user_id: userId,
            event_type: eventType,
            post_id: postId,
            condition: currentCondition,
            pattern: currentPattern,
            timestamp_client: new Date().toISOString(),
            timestamp_server: serverTimestamp(),
            extra_info: extraInfo,
            user_agent: navigator.userAgent
        });
    } catch (error) {
        console.error("ログ保存エラー:", error);
    }
}


function initMap() {
    logEvent("page_start");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 34.8102, lng: 135.5616 },
        zoom: 18,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy'
    });

    loadAvatars(() => loadDataAndDisplayMarkers(currentPattern, currentCondition));
    // 🆕 開始測位
    startGeolocation();

    // 🆕 可選：右下に「現在地」ボタン
    addLocateControl();

}


function switchPattern(pattern) {
    currentPattern = pattern;
    loadDataAndDisplayMarkers(currentPattern, currentCondition);
}

function switchCondition(condition) {
    currentCondition = condition;
    loadDataAndDisplayMarkers(currentPattern, currentCondition);
}
// === 相对时间工具 ===
function randomPastDate(maxMinutes = 7 * 24 * 60) {
    // 随机过去时间，默认 7 天内
    const now = Date.now();
    const delta = Math.floor(Math.random() * maxMinutes * 60 * 1000);
    return new Date(now - delta);
}

function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return `${s}秒前`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}分前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}時間前`;
    const d = Math.floor(h / 24);
    return `${d}日前`;
}

// 针对打开着的 InfoWindow，按 id 每分钟刷新“时间前”文本
function startTimeTicker(marker) {
    if (marker._timeTimer) clearInterval(marker._timeTimer);
    const update = () => {
        const el = document.getElementById(`time_${marker.customData.id}`);
        if (!el) {
            clearInterval(marker._timeTimer);
            return;
        }
        el.textContent = timeAgo(marker.customData.createdAt);
    };
    update();
    marker._timeTimer = setInterval(update, 60 * 1000);
}
/* === いいね用工具 ===
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 点击后切换：未点赞→+1，已点赞→-1
/*function toggleLike(id) {
  const m = allMarkers.find(mm => mm.customData.id === id);
  if (!m) return;

  // DOM 引用
  const btn = document.getElementById(`likeBtn_${id}`);
  const countEl = document.getElementById(`like_${id}`);
  const heartEl = document.getElementById(`heart_${id}`);
  if (!btn || !countEl || !heartEl) return;

  // 切换状态
  const liked = !!m.customData.likedByMe;
  if (liked) {
    // 取消点赞
    m.customData.likedByMe = false;
    m.customData.likeCount = Math.max(0, (m.customData.likeCount || 0) - 1);
    countEl.textContent = m.customData.likeCount;
    heartEl.textContent = '🤍';
    // 恢复“未点赞”样式
    btn.style.background = '#ffeef0';
    btn.style.color = '#d6336c';
    btn.setAttribute('data-liked', '0');
    btn.title = 'いいね！';
  } else {
    // 点赞
    m.customData.likedByMe = true;
    m.customData.likeCount = (m.customData.likeCount || 0) + 1;
    countEl.textContent = m.customData.likeCount;
    heartEl.textContent = '❤️';
    // 激活“已点赞”样式
    btn.style.background = '#ffd6dc';
    btn.style.color = '#b71852';
    btn.setAttribute('data-liked', '1');
    btn.title = 'いいねを取消';
  }
}*/

// === 現在地の追跡を開始 ===
function startGeolocation() {
    if (!navigator.geolocation) {
        console.warn('Geolocation not supported');
        showToast('⚠️ この端末では現在地を取得できません');
        return;
    }
    if (geoWatchId !== null) return; // 既に開始済みなら何もしない

    geoWatchId = navigator.geolocation.watchPosition(
        onGeoSuccess,
        onGeoError,
        {
            enableHighAccuracy: true, // できるだけ高精度
            maximumAge: 5000,         // 5秒までのキャッシュはOK
            timeout: 20000            // 20秒でタイムアウト
        }
    );
}

// === 測位成功時 ===
function onGeoSuccess(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    const latLng = new google.maps.LatLng(latitude, longitude);

    // 初回生成
    if (!myPosMarker) {
        myPosMarker = new google.maps.Marker({
            position: latLng,
            map,
            clickable: false,
            zIndex: 9999,
            // Google Maps のシンボル（青丸＋白フチ）
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#1a73e8',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            }
        });

        myAccuracyCircle = new google.maps.Circle({
            map,
            center: latLng,
            radius: accuracy || 0,
            strokeColor: '#1a73e8',
            strokeOpacity: 0.25,
            strokeWeight: 1,
            fillColor: '#1a73e8',
            fillOpacity: 0.08,
            clickable: false,
            zIndex: 9998
        });
    } else {
        // 2回目以降は位置と精度だけ更新
        myPosMarker.setPosition(latLng);
        if (myAccuracyCircle) {
            myAccuracyCircle.setCenter(latLng);
            myAccuracyCircle.setRadius(accuracy || 0);
        }
    }

    // 最初の測位で地図を寄せる
    if (firstFix) {
        map.panTo(latLng);
        firstFix = false;
    }
}

// === 測位失敗時 ===
function onGeoError(err) {
    // 典型コード: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
    console.warn('Geolocation error:', err);
    showToast(`⚠️ 現在地エラー: ${err.message || '取得できませんでした'}`);
}

// === 現在地の追跡を停止（必要なら呼び出し）===
function stopGeolocation() {
    if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
    }
    if (myPosMarker) {
        myPosMarker.setMap(null);
        myPosMarker = null;
    }
    if (myAccuracyCircle) {
        myAccuracyCircle.setMap(null);
        myAccuracyCircle = null;
    }
    firstFix = true;
}
function addLocateControl() {
    const btn = document.createElement('button');
    btn.textContent = '現在地';
    btn.style.cssText = `
    background:#fff; border:1px solid #ccc; border-radius:6px;
    padding:6px 10px; margin:10px; cursor:pointer; font-size:12px;
    box-shadow:0 1px 4px rgba(0,0,0,0.3);
  `;
    btn.title = '現在地へ移動';
    btn.addEventListener('click', () => {
        if (myPosMarker) {
            map.panTo(myPosMarker.getPosition());
        } else {
            startGeolocation();
        }
    });
    // 右下に配置
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(btn);
}

function loadAvatars(callback) {
    fetch('./avatars/avatar_list.json')
        .then(res => res.json())
        .then(data => {
            avatarMap = {};
            data.forEach((item, idx) => {
                avatarMap[idx] = item; // 固定 id → avatar/name
            });
            callback();
        });
}

function loadDataAndDisplayMarkers(pattern, condition) {
    fetch(`./data/${pattern}.json`)
        .then(res => res.json())
        .then(data => {
            clearMarkers();  // 清空旧的 marker 和聚类

            data.forEach((markerData, index) => {
                const iconUrl = getIconForMarker(markerData, condition);
                const marker = new google.maps.Marker({
                    position: markerData.position,
                    map: map,  // 直接画在地图上
                    icon: {
                        url: iconUrl,
                        scaledSize: new google.maps.Size(28, 28),
                    },
                    opacity: 1.0
                });

                marker.customData = {
                    id: index,
                    type: markerData.type,
                    content: markerData.questionText || `困りごと: ${markerData.type}に関する問題`,
                    answered: false,
                    answeredByUser: false,
                    responseText: null,
                    defaultIcon: iconUrl,
                    createdAt: randomPastDate(), // 随机的过去时间（默认 7 天内）
                    //likeCount: randomInt(0, 200)  // 随机 0-200 的「いいね」
                    // likedByMe: false
                };

                bindInfoWindow(marker);
                allMarkers.push(marker);
            });


            buildClustersKMeans();
        });
}


function getIconForMarker(markerData, condition, plain = false, highlight = false) {
    if (condition === 'noHint') {
        return './icons/question.png';
    } else {
        const folder = currentPattern === 'pattern1' ? 'p1'
            : currentPattern === 'pattern2' ? 'p2'
                : currentPattern === 'pattern3' ? 'p3'
                    : 'p1';

        const suffix = highlight ? '_hl' : plain ? '_plain' : '';
        return `./icons/${folder}/${markerData.type}${suffix}.png`;
    }
}

function clearMarkers() {
    // 清掉地图上的 marker
    allMarkers.forEach(marker => marker.setMap(null));
    allMarkers = [];
    selectedMarkers = [];

    // 👇 同时把聚类结果也清掉
    clusters = [];
    markerIdToClusterId = {};
}

// === k-means 聚类：同じ type ごとにクラスタリング ===
function buildClustersKMeans() {
    clusters = [];
    markerIdToClusterId = {};

    const bucketByType = {};

    // 1. type ごとに分ける
    for (const m of allMarkers) {
        const t = m.customData.type;
        if (!bucketByType[t]) bucketByType[t] = [];
        bucketByType[t].push(m);
    }

    let nextClusterId = 0;

    // 2. 各 type 内で k-means
    for (const [type, markers] of Object.entries(bucketByType)) {
        const n = markers.length;

        if (n === 0) continue;

        // 点数が少ない場合は1クラスタ
        const k = decideK(n);

        const result = kmeansMarkers(markers, k);

        result.forEach(members => {
            const cid = nextClusterId++;

            clusters.push({
                id: cid,
                type,
                members
            });

            members.forEach(m => {
                markerIdToClusterId[m.customData.id] = cid;
            });
        });
    }

    console.log("k-means clusters:", clusters);
}

// === クラスタ数 k を決める ===
// 必要に応じて調整してOK
function decideK(n) {
    if (n <= 10) return 1;
    if (n <= 15) return 2;
    if (n <= 20) return 3;
    return Math.ceil(Math.sqrt(n));
}


// === marker 配列に対する k-means ===
function kmeansMarkers(markers, k, maxIter = 100) {
    // 緯度経度を数値データに変換
    const points = markers.map(m => {
        const pos = m.getPosition();
        return {
            marker: m,
            lat: pos.lat(),
            lng: pos.lng()
        };
    });

    // 初期重心をランダムに選ぶ
    let centroids = initializeCentroids(points, k);

    let assignments = new Array(points.length).fill(-1);

    for (let iter = 0; iter < maxIter; iter++) {
        let changed = false;

        // 1. 各点を一番近い重心に割り当てる
        points.forEach((p, i) => {
            let bestCluster = 0;
            let bestDist = Infinity;

            centroids.forEach((c, ci) => {
                const d = distanceLatLng(p.lat, p.lng, c.lat, c.lng);
                if (d < bestDist) {
                    bestDist = d;
                    bestCluster = ci;
                }
            });

            if (assignments[i] !== bestCluster) {
                assignments[i] = bestCluster;
                changed = true;
            }
        });

        // 変化がなければ終了
        if (!changed) break;

        // 2. 重心を更新
        centroids = updateCentroids(points, assignments, k);
    }

    // 3. 結果を members 配列にする
    const groups = Array.from({ length: k }, () => []);

    points.forEach((p, i) => {
        groups[assignments[i]].push(p.marker);
    });

    // 空クラスタを除外
    return groups.filter(g => g.length > 0);
}


// === 初期重心を選ぶ ===
function initializeCentroids(points, k) {
    const shuffled = [...points].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, k).map(p => ({
        lat: p.lat,
        lng: p.lng
    }));
}


// === 重心更新 ===
function updateCentroids(points, assignments, k) {
    const sums = Array.from({ length: k }, () => ({
        lat: 0,
        lng: 0,
        count: 0
    }));

    points.forEach((p, i) => {
        const clusterId = assignments[i];
        sums[clusterId].lat += p.lat;
        sums[clusterId].lng += p.lng;
        sums[clusterId].count += 1;
    });

    return sums.map((s, i) => {
        if (s.count === 0) {
            // 空クラスタ対策：ランダムな点を重心にする
            const randomPoint = points[Math.floor(Math.random() * points.length)];
            return {
                lat: randomPoint.lat,
                lng: randomPoint.lng
            };
        }

        return {
            lat: s.lat / s.count,
            lng: s.lng / s.count
        };
    });
}


// === 緯度経度間の距離 ===
function distanceLatLng(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const toRad = x => x * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// === 根据 marker 取它所在簇的所有成员 ===
function getClusterMembers(marker, includeSelf = true) {
    const cid = markerIdToClusterId[marker.customData.id];
    if (cid === undefined) return [];
    const members = clusters[cid]?.members || [];
    return includeSelf ? members : members.filter(m => m !== marker);
}


function bindInfoWindow(marker) {
    const infoWindow = new google.maps.InfoWindow();


    marker.addListener("click", () => {
        logEvent("click_marker", marker.customData.id, {
            type: marker.customData.type,
            content: marker.customData.content,
            answered: marker.customData.answered
        });

        if (activeInfoWindow) activeInfoWindow.close();

        selectedMarkers.forEach(m => {
            m.setIcon({
                url: m.customData.defaultIcon,
                scaledSize: new google.maps.Size(28, 28)
            });
        });
        selectedMarkers = [];

        if (currentCondition === 'similarPlusSolved') {
            // 👇 现在不再用“20m 圆形邻域”，改成“所在簇的全体成员”
            const selected = getClusterMembers(marker, true);
            selected.forEach(m => {
                m.setIcon({
                    url: getIconForMarker(m.customData, currentCondition, false, true),
                    scaledSize: new google.maps.Size(28, 28)
                });
            });
            selectedMarkers = selected;
        }


        const group = getClusterMembers(marker, true);
        const avatar = avatarMap[marker.customData.id % Object.keys(avatarMap).length];
        const timeStr = timeAgo(marker.customData.createdAt);
        const timeBadge = `
      <span id="time_${marker.customData.id}" 
            style="color:#888; font-size:12px;">${timeStr}</span>`;
        /*const likeBadge = `
  <span
    id="likeWrap_${marker.customData.id}"
    style="
      display:inline-flex; align-items:center; gap:4px;
      background:#ffeef0; color:#d6336c;
      padding:2px 8px; border-radius:12px; font-size:12px;
      user-select:none; cursor:default;
    "
    role="status" aria-label="いいね数"
  >
    <span aria-hidden="true">❤️</span>
    <span id="like_${marker.customData.id}">${marker.customData.likeCount}</span>
  </span>`;*/




        if (!marker.customData.answered) {
            let contentHtml = `
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;">
  <div style="display:flex; align-items:center; gap:10px;">
    <img src="${avatar.avatar}" width="32" height="32" style="border-radius:50%;">
    <strong>${avatar.name} さん</strong>
  </div>
  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
    ${timeBadge}
    
  </div>
</div>


                <p style="margin-top:5px; white-space:normal; overflow-wrap:break-word; word-break:break-word;">「${marker.customData.content}」</p>`;

            if (currentCondition === 'similarPlusSolved') {
                const count = group.length;
                const peopleBadge = `
    <div style="
        font-size: 13px;
        color: #a05a00;
        margin-top: 8px;
    ">
        📍 <span style="
            display: inline-block;
            background-color: #ffa726;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: bold;
            font-size: 13px;
            margin-right: 4px;
        ">${count}人</span>がこのエリアで同じ種類の困りごとを投稿しています！
    </div>
`;

                contentHtml += peopleBadge;
            }


            contentHtml += `
  <div style="margin-top: 10px;">
    <textarea id="response_${marker.customData.id}"
      placeholder="ここに入力してください"
      style="
        width: 100%;
        height: 60px;
        font-size: 14px;
        padding: 6px 10px;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-sizing: border-box;
        resize: vertical;
      "
    ></textarea>
  </div>
  <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
    <button onclick="submitResponse(${marker.customData.id})"
      style="
        padding: 8px 16px;
        background-color: #f0f2f5;
        color: #333;
        border: 1px solid #ccc;
        border-radius: 20px;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
        cursor: pointer;
        transition: background-color 0.2s ease;
      "
      onmouseover="this.style.backgroundColor='#e1e4e8'"
      onmouseout="this.style.backgroundColor='#f0f2f5'"
    >送信</button>
  </div>
`;


            infoWindow.setContent(`
    <div style="
      width: 260px;
      max-width: calc(100vw - 40px);
      box-sizing: border-box;
      padding: 14px;
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      background: white;
      overflow: hidden;
      overflow-wrap: break-word;
      word-break: break-word;
    ">
      ${contentHtml}
    </div>
  `);


        } else {
            let badgeHtml = '';
            if (currentCondition === 'similarPlusSolved' && marker.customData.answeredByUser) {
                const helpCount = getClusterMembers(marker, true).length;
                badgeHtml = `
        <div style="
            background: #e6f5ea;
            color: #256029;
            margin-top: 10px;
            padding: 8px 12px;
            border-radius: 10px;
            border-left: 4px solid #4caf50;
            font-size: 13px;
        ">
            👏 この回答で <strong>${helpCount}</strong> 人が助けられました！
        </div>
    `;
            }


            const contentHtml = `
        <div style="display:flex; align-items:flex-start; gap:10px; justify-content:space-between; flex-wrap:wrap;">
  <div style="display:flex; align-items:center; gap:10px;">
    <img src="${avatar.avatar}" width="32" height="32" style="border-radius:50%;">
    <strong>${avatar.name} さん</strong>
  </div>

  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
    ${timeBadge}
    
    <button id="toggleBtn_${marker.customData.id}" onclick="toggleQuestion(${marker.customData.id})"
      style="
        font-size: 12px;
        padding: 2px 8px;
        border: none;
        background-color: #f0f0f0;
        border-radius: 12px;
        cursor: pointer;
      "
    >原文</button>
  </div>
</div>

<div style="margin: 6px 0 10px 0; color: #555; font-size: 13px; white-space: normal; overflow-wrap: break-word; word-break: break-word;">
  「${marker.customData.content}」
</div>

<!-- 感谢语：黑色、与用户名一致 -->
<div style="margin-top: 4px; font-size: 14px; color: #000;">
  助けてくれて、本当にありがとう！すごく参考になりました！

</div>


        <div style="margin-top: 6px; font-size: 13px; color: #444; display: flex; justify-content: space-between; align-items: center;">
            <span>✏️ <span style="color: #555;">投稿内容：</span></span>
            <button id="editBtn_${marker.customData.id}" onclick="editResponse(${marker.customData.id})"
                style="font-size: 12px; padding: 2px 8px; border: none; background-color: #eee; border-radius: 12px; cursor: pointer;">編集</button>
        </div>

        <div id="responseView_${marker.customData.id}" style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px; white-space: normal; overflow-wrap: break-word; word-break: break-word;">
            ${marker.customData.responseText}
        </div>

        <div id="responseEdit_${marker.customData.id}" style="display: none; margin-top: 6px;">
            <textarea id="editInput_${marker.customData.id}" style="width: 100%; font-size: 13px; padding: 6px; border-radius: 6px; border: 1px solid #ccc; box-sizing: border-box;">${marker.customData.responseText}</textarea>
            <div style="text-align: right; margin-top: 4px;">
                <button onclick="cancelEdit(${marker.customData.id})"
                    style="font-size: 12px; padding: 4px 10px; border: none; background-color: #eee; color: #333; border-radius: 14px; cursor: pointer; margin-right: 6px;">キャンセル</button>
                <button onclick="saveResponse(${marker.customData.id})"
                    style="font-size: 12px; padding: 4px 10px; border: none; background-color: #4caf50; color: white; border-radius: 14px; cursor: pointer;">保存</button>
            </div>
        </div>

        ${badgeHtml}
    `;

            infoWindow.setContent(`
        <div style="
            width: 260px;
            max-width: calc(100vw - 40px);
            box-sizing: border-box;
            padding: 10px 14px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-family: sans-serif;
            font-size: 14px;
            background: white;
            overflow: hidden;
            overflow-wrap: break-word;
            word-break: break-word;
        ">
            ${contentHtml}
        </div>
    `);
        }


        infoWindow.open(map, marker);
        startTimeTicker(marker);
        activeInfoWindow = infoWindow;
    });
    marker.infoWindow = infoWindow;
}
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(51, 51, 51, 0.9);
        color: #fff;
        padding: 12px 20px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: bold;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
        text-align: center;
        white-space: nowrap;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = 1;
    });

    setTimeout(() => {
        toast.style.opacity = 0;
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 2000);
}


async function submitResponse(id) {
    const marker = allMarkers.find(m => m.customData.id === id);
    const input = document.getElementById(`response_${id}`);
    const responseText = input.value.trim();
    if (responseText === '') {
        showToast('⚠️ 内容を入力してください！');
        return;
    }
    await addDoc(collection(db, "answers"), {
        user_id: userId,
        post_id: id,
        answer_text: responseText,
        answer_length: responseText.length,
        condition: currentCondition,
        pattern: currentPattern,
        timestamp_client: new Date().toISOString(),
        timestamp_server: serverTimestamp()
    });

    logEvent("submit_answer", id, {
        answer_length: responseText.length
    });
    const sameTypeNearby = getClusterMembers(marker, true);


    sameTypeNearby.forEach(m => {
        m.customData.answered = true;
        m.customData.responseText = responseText;
        m.customData.answeredByUser = false;

        if (currentCondition === 'similarPlusSolved') {
            m.setOpacity(0.3);
        } else {
            m.setOpacity(1.0);
        }
    });
    marker.customData.answeredByUser = true;
    // 只更新用户点击并回答的 marker 的 infoWindow
    if (marker.infoWindow && marker.infoWindow.getMap()) {
        if (currentCondition === 'similarPlusSolved') {
            const helpCount = sameTypeNearby.length;
            const badgeHtml = `
            <div style="
                background: #e6f5ea;
                color: #256029;
                margin-top: 10px;
                padding: 8px 12px;
                border-radius: 10px;
                border-left: 4px solid #4caf50;
                font-size: 13px;
            ">
                👏 この回答で <strong>${helpCount}</strong> 人が助けられました！
            </div>
        `;

            marker.infoWindow.setContent(`
            <div style="width: 260px; max-width: calc(100vw - 40px); font-family: sans-serif; font-size: 14px; padding: 10px; box-sizing: border-box; overflow: hidden; overflow-wrap: break-word; word-break: break-word;">
            
            <p><strong>ご回答ありがとうございます!</strong></p>
                <div style="margin-top: 6px; font-size: 13px; color: #444;">
                    ✏️ <span style="color: #555;">投稿内容：</span><br>
                    <div style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px; white-space: normal; overflow-wrap: break-word; word-break: break-word;">
                        ${marker.customData.responseText}
                    </div>
                </div>
                ${badgeHtml}
            </div>
        `);

        } else {
            marker.infoWindow.setContent(`
            <div style="width: 260px; max-width: calc(100vw - 40px); font-family: sans-serif; font-size: 14px; padding: 10px; box-sizing: border-box; overflow: hidden; overflow-wrap: break-word; word-break: break-word;">
            
            <p><strong>ご回答ありがとうございます!</strong></p>
                <div style="margin-top: 6px; font-size: 13px; color: #444;">
                    ✏️ <span style="color: #555;">投稿内容：</span><br>
                    <div style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px; white-space: normal; overflow-wrap: break-word; word-break: break-word;">
                        ${marker.customData.responseText}
                    </div>
                </div>
            </div>
        `);

        }
    }


    // === 如果是类似投稿＋解決人数提示，显示徽章 + Toast ===
    if (currentCondition === 'similarPlusSolved') {
        const helpCount = sameTypeNearby.length;

        const badgeHtml = `
                <div style="
                    background: #e6f5ea;
                    color: #256029;
                    margin-top: 10px;
                    padding: 8px 12px;
                    border-radius: 10px;
                    border-left: 4px solid #4caf50;
                    font-size: 13px;
                ">
                    👏 この回答で <strong>${helpCount}</strong> 人が助けられました！
                </div>
            `;

        marker.infoWindow.setContent(`
                <div style="
                    width: 260px;
                    max-width: calc(100vw - 40px);
                    font-family: sans-serif;
                    font-size: 14px;
                    padding: 10px;
                    box-sizing: border-box;
                    overflow: hidden;
                    overflow-wrap: break-word;
                    word-break: break-word;
                ">
                
                    <p><strong>ご回答ありがとうございます!</strong></p>
                    <div style="margin-top: 6px; font-size: 13px; color: #444;">
  ✏️ <span style="color: #555;">投稿内容：</span><br>
  <div style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px; white-space: normal; overflow-wrap: break-word; word-break: break-word;">
    ${marker.customData.responseText}
  </div>
</div>
                    ${badgeHtml}
                </div>
            `);



    } else {
        marker.infoWindow.setContent(`
                <div style="width: 260px; max-width: calc(100vw - 40px); font-family: sans-serif; font-size: 14px; padding: 10px; box-sizing: border-box; overflow: hidden; overflow-wrap: break-word; word-break: break-word;">
                
                <p><strong>ご回答ありがとうございます!</strong></p>
                    <div style="margin-top: 6px; font-size: 13px; color: #444;">
  ✏️ <span style="color: #555;">投稿内容：</span><br>
  <div style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px; white-space: normal; overflow-wrap: break-word; word-break: break-word;">
    ${marker.customData.responseText}
  </div>
</div>
                </div>
            `);

    }
    // 弹出气球提示
    showToast('🎉 回答送信完了！ありがとうございます！');
}

function toggleQuestion(id) {
    const q = document.getElementById(`question_${id}`);
    const btn = document.getElementById(`toggleBtn_${id}`);
    if (q.style.display === 'none') {
        q.style.display = 'block';
        btn.textContent = '隠す';
    } else {
        q.style.display = 'none';
        btn.textContent = '原文';
    }
}

function editResponse(id) {
    document.getElementById(`responseView_${id}`).style.display = 'none';
    document.getElementById(`responseEdit_${id}`).style.display = 'block';
    const btn = document.getElementById(`editBtn_${id}`);
    if (btn) btn.style.display = 'none';
}


function cancelEdit(id) {
    document.getElementById(`responseEdit_${id}`).style.display = 'none';
    document.getElementById(`responseView_${id}`).style.display = 'block';
    const btn = document.getElementById(`editBtn_${id}`);
    if (btn) btn.style.display = 'inline-block';
}



function saveResponse(id) {
    const newText = document.getElementById(`editInput_${id}`).value.trim();
    if (!newText) {
        showToast('⚠️ 内容を入力してください！');
        return;
    }

    // 更新内存中的回答文本
    const marker = allMarkers.find(m => m.customData.id === id);
    marker.customData.responseText = newText;

    // 重绘 InfoWindow
    google.maps.event.trigger(marker, 'click');
}




function haversineDistance(pos1, pos2) {
    const R = 6371e3;
    const toRad = x => x * Math.PI / 180;
    const lat1 = pos1.lat(), lng1 = pos1.lng();
    const lat2 = pos2.lat(), lng2 = pos2.lng();
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

window.initMap = initMap;
window.switchPattern = switchPattern;
window.switchCondition = switchCondition;
window.submitResponse = submitResponse;
window.toggleQuestion = toggleQuestion;
window.editResponse = editResponse;
window.cancelEdit = cancelEdit;
window.saveResponse = saveResponse;
