// --- 生成bike_parking图钉的改进版脚本 ---
// 将角度坐标转换为小数
const centerLat = 34.80911436681389; // 中心经度纬度（N）
const centerLng = 135.56075421827867; // 中心经度纬度（E）

const pinCount = 5; // 图钉数量
const radiusInMeters = 60; // 分布半径（米）

// bike_parking类型的问题表达方式列表
const bikeParkingQuestions = [
    "無人コンビニってどうやって使うの？なんか入るだけで緊張するんだけど…支払いってどこでするの？？",
    "すみません、無人コンビニの使い方がよくわかりません。どなたか支払い方法や利用の流れをご存じの方がいれば教えていただけると助かります。",
    "誰か〜！あの無人のコンビニ、使い方が謎すぎて怖くて入れない！どうやって払うの？Suicaいける？？",
    "無人コンビニ利用してみたいけど、支払い方法とか何が使えるのかよく分かりません。案内とかもう少し分かりやすくなりませんか？",
    "初歩的な質問ですみません…無人コンビニって現金NGなんですか？あと、どうやって入ってどうやって出るのかも実は不安です。"
];

// 生成一组以中心为基准，随机偏移且防止重叠的坐标点，中心密集、边缘稀疏
function generatePins(centerLat, centerLng, count, radiusMeters) {
    const pins = [];
    const minDistanceMeters = 5; // 最小间距（米），防止重叠

    while (pins.length < count) {
        const angle = Math.random() * 2 * Math.PI;
        const r = radiusMeters * Math.pow(Math.random(), 2); // 使用平方，加剧中心密集

        const dx = r * Math.cos(angle);
        const dy = r * Math.sin(angle);

        const deltaLat = dy / 111000;
        const deltaLng = dx / (111000 * Math.cos(centerLat * Math.PI / 180));

        const lat = centerLat + deltaLat;
        const lng = centerLng + deltaLng;

        // 检查新生成的位置是否与已有的位置太近
        const isTooClose = pins.some(existing => {
            const dLat = (existing.lat - lat) * 111000;
            const dLng = (existing.lng - lng) * 111000 * Math.cos(centerLat * Math.PI / 180);
            const distance = Math.sqrt(dLat * dLat + dLng * dLng);
            return distance < minDistanceMeters;
        });

        if (!isTooClose) {
            pins.push({ lat, lng });
        }
    }

    return pins;
}

// 主程序：生成pins并组合成指定的输出格式
function createBikeParkingPins() {
    const positions = generatePins(centerLat, centerLng, pinCount, radiusInMeters);

    const finalPins = positions.map((pos, index) => ({
        position: {
            lat: pos.lat,
            lng: pos.lng
        },
        type: "unmanned_store",
        questionText: bikeParkingQuestions[index]
    }));

    return finalPins;
}

// 自定义打印函数，保证questionText不换行
function printPinsManually(pins) {
    let output = "[\n";
    for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        output += `  {\n`;
        output += `    "position": {\n`;
        output += `      "lat": ${pin.position.lat},\n`;
        output += `      "lng": ${pin.position.lng}\n`;
        output += `    },\n`;
        output += `    "type": "${pin.type}",\n`;
        output += `    "questionText": "${pin.questionText}"\n`;
        output += `  }${i < pins.length - 1 ? "," : ""}\n`;
    }
    output += "]";
    console.log(output);
}

// 运行主程序
const bikeParkingPins = createBikeParkingPins();
printPinsManually(bikeParkingPins);

// --- 结束 ---

