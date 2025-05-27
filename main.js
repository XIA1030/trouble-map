// main.js - 發問者表示機能（固定ユーザー名とアイコン）追加

let map;
let currentPattern = 'pattern1';
let currentCondition = 'noHint';
let allMarkers = [];
let activeInfoWindow = null;
let selectedMarkers = [];
let avatarMap = {}; // ID → {name, avatar}

function initMap() {

    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 34.8102, lng: 135.5616 },
        zoom: 18,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy'
    });

    loadAvatars(() => loadDataAndDisplayMarkers(currentPattern, currentCondition));

}


function switchPattern(pattern) {
    currentPattern = pattern;
    loadDataAndDisplayMarkers(currentPattern, currentCondition);
}

function switchCondition(condition) {
    currentCondition = condition;
    loadDataAndDisplayMarkers(currentPattern, currentCondition);
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
            clearMarkers();
            data.forEach((markerData, index) => {
                const iconUrl = getIconForMarker(markerData, condition);
                const marker = new google.maps.Marker({
                    position: markerData.position,
                    map: map,
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
                    responseText: null,
                    defaultIcon: iconUrl
                };
                bindInfoWindow(marker);
                allMarkers.push(marker);
            });
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
    allMarkers.forEach(marker => marker.setMap(null));
    allMarkers = [];
    selectedMarkers = [];
}

function bindInfoWindow(marker) {
    const infoWindow = new google.maps.InfoWindow();
    marker.addListener("click", () => {
        if (activeInfoWindow) activeInfoWindow.close();

        selectedMarkers.forEach(m => {
            m.setIcon({
                url: m.customData.defaultIcon,
                scaledSize: new google.maps.Size(28, 28)
            });
        });
        selectedMarkers = [];

        if (currentCondition === 'similarPlusSolved') {
            const selected = getNearbyMarkers(marker.getPosition(), marker.customData.type, 20);
            selected.forEach(m => {
                m.setIcon({
                    url: getIconForMarker(m.customData, currentCondition, false, true),
                    scaledSize: new google.maps.Size(28, 28)
                });
            });
            selectedMarkers = selected;
        }

        const nearby = getNearbyMarkers(marker.getPosition(), marker.customData.type, 20);
        const avatar = avatarMap[marker.customData.id % Object.keys(avatarMap).length];

        if (!marker.customData.answered) {
            let contentHtml = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${avatar.avatar}" width="32" height="32" style="border-radius:50%;">
                    <strong>${avatar.name} さん</strong>
                </div>
                <p style="margin-top:5px;">「${marker.customData.content}」</p>`;

            if (currentCondition === 'similarPlusSolved') {
                const count = nearby.length;
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
        ">${count}人</span>が20メートル圏内に同じ悩みを投稿しています！
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
      width: 90vw;
      max-width: 300px;
      box-sizing: border-box;
      padding: 14px;
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      font-family: 'Helvetica Neue', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      background: white;
    ">
      ${contentHtml}
    </div>
  `);


        } else {
            const helpCount = getNearbyMarkers(marker.getPosition(), marker.customData.type, 20).length;

            const badgeHtml = currentCondition === 'similarPlusSolved' ? `
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
    ` : '';

            const contentHtml = `
        <div style="display:flex; align-items:center; gap:10px; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${avatar.avatar}" width="32" height="32" style="border-radius:50%;">
                <strong>${avatar.name} さん</strong>
                
            </div>
            
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
<div id="question_${marker.customData.id}" style="display: none; margin: 6px 0 10px 0; color: #555; font-size: 13px;">
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

        <div id="responseView_${marker.customData.id}" style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px;">
            ${marker.customData.responseText}
        </div>

        <div id="responseEdit_${marker.customData.id}" style="display: none; margin-top: 6px;">
            <textarea id="editInput_${marker.customData.id}" style="width: 100%; font-size: 13px; padding: 6px; border-radius: 6px; border: 1px solid #ccc;">${marker.customData.responseText}</textarea>
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
            width: 90vw;
            max-width: 300px;
            box-sizing: border-box;
            padding: 10px 14px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-family: sans-serif;
            font-size: 14px;
            background: white;
        ">
            ${contentHtml}
        </div>
    `);
        }


        infoWindow.open(map, marker);
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


function submitResponse(id) {
    const marker = allMarkers.find(m => m.customData.id === id);
    const input = document.getElementById(`response_${id}`);
    const responseText = input.value.trim();
    if (responseText === '') {
        showToast('⚠️ 内容を入力してください！');
        return;
    }

    const sameTypeNearby = getNearbyMarkers(marker.getPosition(), marker.customData.type, 20);

    sameTypeNearby.forEach(m => {
        m.customData.answered = true;
        m.customData.responseText = responseText;

        if (currentCondition === 'similarPlusSolved') {
            m.setOpacity(0.3);
        } else {
            m.setOpacity(1.0);
        }

        if (m.infoWindow && m.infoWindow.getMap()) {
            m.infoWindow.setContent(`
                <div>
                    <p><strong>ご回答ありがとうございます!</strong></p>

<div style="margin-top: 6px; font-size: 13px; color: #444;">
  ✏️ <span style="color: #555;">投稿内容：</span><br>

  <div id="responseView_${marker.customData.id}" style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px;">
    ${marker.customData.responseText}
    <div style="text-align: right; margin-top: 4px;">
      <button onclick="editResponse(${marker.customData.id})"
        style="font-size: 12px; padding: 2px 8px; border: none; background-color: #eee; border-radius: 12px; cursor: pointer;">編集</button>
    </div>
  </div>

  <div id="responseEdit_${marker.customData.id}" style="display: none; margin-top: 6px;">
    <textarea id="editInput_${marker.customData.id}" style="width: 100%; font-size: 13px; padding: 6px; border-radius: 6px; border: 1px solid #ccc;">${marker.customData.responseText}</textarea>
    <div style="text-align: right; margin-top: 4px;">
  <button onclick="cancelEdit(${marker.customData.id})"
    style="font-size: 12px; padding: 4px 10px; border: none; background-color: #eee; color: #333; border-radius: 14px; cursor: pointer; margin-right: 6px;">キャンセル</button>
  <button onclick="saveResponse(${marker.customData.id})"
    style="font-size: 12px; padding: 4px 10px; border: none; background-color: #4caf50; color: white; border-radius: 14px; cursor: pointer;">保存</button>
</div>

  </div>
</div>

                </div>
            `);
        }
    });

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
                    font-family: sans-serif;
                    font-size: 14px;
                    padding: 10px;
                    max-width: 300px;
                ">
                    <p><strong>ご回答ありがとうございます!</strong></p>
                    <div style="margin-top: 6px; font-size: 13px; color: #444;">
  ✏️ <span style="color: #555;">投稿内容：</span><br>
  <div style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px;">
    ${marker.customData.responseText}
  </div>
</div>
                    ${badgeHtml}
                </div>
            `);



    } else {
        marker.infoWindow.setContent(`
                <div style="font-family: sans-serif; font-size: 14px; padding: 10px;">
                    <p><strong>ご回答ありがとうございます!</strong></p>
                    <div style="margin-top: 6px; font-size: 13px; color: #444;">
  ✏️ <span style="color: #555;">投稿内容：</span><br>
  <div style="margin-top: 4px; background: #f7f7f7; border-radius: 6px; padding: 6px 10px;">
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


function getNearbyMarkers(center, type, radiusMeters = 10) {
    return allMarkers.filter(m => {
        return m.customData.type === type &&
            haversineDistance(center, m.getPosition()) <= radiusMeters;
    });
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
