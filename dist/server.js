"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fast_xml_parser_1 = require("fast-xml-parser");
const natural_1 = require("natural");
const generative_ai_1 = require("@google/generative-ai");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const app = (0, express_1.default)();
const PORT = 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path.join(__dirname, '../public')));
const XML_PATH = path.join(__dirname, '../insider.xml');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Initialize Gemini AI if API key is available
let genAI = null;
let model = null;
if (GEMINI_API_KEY) {
    genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    console.log('✅ Gemini AI enabled for smart recommendations');
}
else {
    console.log('⚠️  Gemini API key not found. Using rule-based recommendations.');
}
const RULES = [
    { trigger: ['süpürge', 'vacuum'], targets: ['mop', 'vileda', 'temizlik seti', 'mikrofiber bez'] },
    { trigger: ['kahve makinesi', 'coffee'], targets: ['kahve fincanı', 'kahve bardağı', 'filtre kahve', 'çekirdek kahve'] },
    { trigger: ['yatak', 'baza'], targets: ['nevresim takımı', 'yastık', 'çarşaf', 'yorgan', 'battaniye'] },
    { trigger: ['telefon', 'cep telefonu'], targets: ['telefon kılıfı', 'ekran koruyucu', 'şarj aleti', 'kulaklık'] },
    { trigger: ['laptop', 'bilgisayar', 'notebook'], targets: ['laptop çantası', 'mouse', 'klavye', 'notebook standı'] },
    { trigger: ['tv', 'televizyon'], targets: ['tv askı aparatı', 'hdmı kablo', 'ses sistemi'] },
    { trigger: ['bıçak', 'bıçağı'], targets: ['kesme tahtası', 'bıçak bileyici', 'bıçak bloğu'] },
    { trigger: ['tencere', 'tava'], targets: ['kepçe', 'kaşık', 'spatula', 'fırın eldiveni'] },
    { trigger: ['tabak', 'yemek takımı'], targets: ['çatal kaşık bıçak', 'masa örtüsü', 'peçete'] },
    { trigger: ['ütü'], targets: ['ütü masası', 'ütü masası kılıfı'] },
];
// Global state
let products = [];
let productMap = new Map();
let tfidf = new natural_1.TfIdf();
async function initialize() {
    if (!fs.existsSync(XML_PATH)) {
        console.error(`File not found: ${XML_PATH}`);
        return;
    }
    console.log('Reading XML file...');
    const xmlData = fs.readFileSync(XML_PATH, 'utf-8');
    console.log('Parsing XML...');
    const parser = new fast_xml_parser_1.XMLParser({
        ignoreAttributes: false,
        ignoreDeclaration: true,
        removeNSPrefix: true
    });
    const jsonObj = parser.parse(xmlData);
    let items = jsonObj.rss?.channel?.item;
    if (!items) {
        console.log('Standard RSS structure not found.');
        return;
    }
    if (!Array.isArray(items)) {
        items = [items];
    }
    console.log(`Found ${items.length} products.`);
    products = items.map((item) => ({
        id: item.id,
        name: item.custom_label_3 || item.title,
        description: item.description || '',
        raw: item
    }));
    products.forEach(p => productMap.set(p.id, p));
    console.log('Building TF-IDF index (this may take a moment)...');
    products.forEach((p, index) => {
        const content = `${p.name} ${p.name} ${p.description}`;
        tfidf.addDocument(content);
        p.docIndex = index;
    });
    console.log('TF-IDF index built.');
}
async function getAIRecommendations(targetProduct, allProducts, type) {
    if (!model)
        return [];
    try {
        const productNames = allProducts.slice(0, 100).map(p => `${p.id}: ${p.name}`).join('\n');
        const prompt = type === 'complementary'
            ? `Sen bir e-ticaret ürün öneri uzmanısın. 

Ana Ürün: ${targetProduct.name} (SKU: ${targetProduct.id})
Açıklama: ${targetProduct.description}

Bu ürüne TAMAMLAYICI (complementary) olabilecek 3 ürünün SKU'larını öner. Tamamlayıcı ürün, ana ürünle birlikte kullanılan veya onu tamamlayan ürünlerdir.

Örnek:
- Ütü masası → Ütü masası kılıfı
- Süpürge → Mop, temizlik seti
- Bıçak → Kesme tahtası, bileyici
- Kahve makinesi → Fincan, kahve

Mevcut Ürünler (ilk 100):
${productNames}

Sadece SKU kodlarını virgülle ayırarak ver. Örnek: ABC123,DEF456,GHI789`
            : `Sen bir e-ticaret ürün öneri uzmanısın.

Ana Ürün: ${targetProduct.name} (SKU: ${targetProduct.id})
Açıklama: ${targetProduct.description}

Bu ürüne BENZER 3 ürünün SKU'larını öner. Benzer ürünler aynı kategoride, aynı markada veya benzer özelliklerde olmalı.

Mevcut Ürünler (ilk 100):
${productNames}

Sadece SKU kodlarını virgülle ayırarak ver. Örnek: ABC123,DEF456,GHI789`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        // Extract SKUs from response
        const skus = text.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        console.log(`AI recommended SKUs: ${skus.join(', ')}`);
        return skus;
    }
    catch (error) {
        console.error('AI recommendation error:', error);
        return [];
    }
}
function recommendBundle(target, type) {
    if (target.docIndex === undefined)
        return [];
    const combinedTargetText = (target.name + ' ' + target.description).toLowerCase();
    let recommendations = [];
    // 1. Complementary Logic
    if (type === 'complementary') {
        const activeRule = RULES.find(rule => rule.trigger.some(t => combinedTargetText.includes(t.toLowerCase())));
        if (activeRule) {
            const validTargets = activeRule.targets.filter(t => !combinedTargetText.includes(t.toLowerCase()));
            const targetsToSearch = validTargets.length > 0 ? validTargets : activeRule.targets;
            const candidates = products.filter(p => {
                if (p.id === target.id)
                    return false;
                const text = (p.name + ' ' + p.description).toLowerCase();
                return targetsToSearch.some(t => text.includes(t.toLowerCase()));
            });
            // Add up to 3 complementary products
            while (recommendations.length < 3 && candidates.length > 0) {
                const randomIndex = Math.floor(Math.random() * candidates.length);
                const p = candidates.splice(randomIndex, 1)[0];
                recommendations.push({ ...p, isComplementary: true });
            }
        }
    }
    // 2. Similar Logic (TF-IDF)
    // If we need more items (either because type is 'similar' or we didn't find enough complementary)
    if (recommendations.length < 3) {
        const query = `${target.name} ${target.name} ${target.description}`;
        const scores = [];
        tfidf.tfidfs(query, (i, measure) => {
            if (i !== target.docIndex) {
                scores.push({ index: i, score: measure });
            }
        });
        scores.sort((a, b) => b.score - a.score);
        const existingIds = new Set(recommendations.map(r => r.id));
        for (const s of scores) {
            const p = products[s.index];
            if (!existingIds.has(p.id)) {
                recommendations.push({ ...p, isComplementary: false });
                if (recommendations.length >= 3)
                    break;
            }
        }
    }
    return recommendations;
}
app.get('/api/product/:sku', (req, res) => {
    const sku = req.params.sku;
    const product = productMap.get(sku.trim());
    if (!product) {
        res.status(404).json({ error: 'Ürün bulunamadı' });
        return;
    }
    res.json(product);
});
app.get('/api/recommend', async (req, res) => {
    const { sku, type } = req.query;
    if (!sku || typeof sku !== 'string') {
        res.status(400).json({ error: 'SKU is required' });
        return;
    }
    const mode = (type === 'complementary') ? 'complementary' : 'similar';
    const product = productMap.get(sku.trim());
    if (!product) {
        res.status(404).json({ error: 'Ürün bulunamadı' });
        return;
    }
    let bundle = [];
    // Try AI recommendations first if available
    if (model) {
        try {
            const aiSkus = await getAIRecommendations(product, products, mode);
            bundle = aiSkus
                .map(sku => productMap.get(sku))
                .filter((p) => p !== undefined)
                .slice(0, 3)
                .map(p => ({ ...p, isComplementary: mode === 'complementary' }));
            console.log(`AI found ${bundle.length} products`);
        }
        catch (error) {
            console.error('AI recommendation failed, falling back to rules:', error);
        }
    }
    // Fallback to rule-based if AI didn't return enough results
    if (bundle.length < 3) {
        console.log('Using rule-based recommendations');
        const ruleBased = recommendBundle(product, mode);
        // Add missing products from rule-based
        const existingIds = new Set(bundle.map(p => p.id));
        for (const p of ruleBased) {
            if (!existingIds.has(p.id) && bundle.length < 3) {
                bundle.push(p);
            }
        }
    }
    res.json({
        target: product,
        bundle: bundle,
        method: model && bundle.length > 0 ? 'ai' : 'rules'
    });
});
app.listen(PORT, async () => {
    await initialize();
    console.log(`Server running at http://localhost:${PORT}`);
});
