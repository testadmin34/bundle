import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { TfIdf } from 'natural';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const XML_PATH = path.join(__dirname, '../insider.xml');
const XML_URL = process.env.XML_URL || 'https://cf6ad7.s3.amazonaws.com/insider.xml';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Initialize Gemini AI if API key is available
let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    console.log('✅ Gemini AI enabled for smart recommendations');
} else {
    console.log('⚠️  Gemini API key not found. Using rule-based recommendations.');
}

interface Product {
    id: string;
    name: string;
    description: string;
    raw: any;
    docIndex?: number;
    isComplementary?: boolean;
}

interface ComplementaryRule {
    trigger: string[];
    targets: string[];
}

const RULES: ComplementaryRule[] = [
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
let products: Product[] = [];
let productMap = new Map<string, Product>();
let tfidf = new TfIdf();

async function initialize() {
    let xmlData: string;

    // Try to load from local file first, then from URL
    if (fs.existsSync(XML_PATH)) {
        console.log('Reading XML file from local path...');
        xmlData = fs.readFileSync(XML_PATH, 'utf-8');
    } else {
        console.log(`Local XML not found. Fetching from URL: ${XML_URL}`);
        try {
            const response = await fetch(XML_URL);
            if (!response.ok) {
                throw new Error(`Failed to fetch XML: ${response.statusText}`);
            }
            xmlData = await response.text();
            console.log('XML fetched successfully from URL');
            // Save the fetched XML locally for future runs
            try {
                fs.writeFileSync(XML_PATH, xmlData, 'utf-8');
                console.log('Fetched XML saved to local path for caching');
            } catch (writeErr) {
                console.error('Failed to write fetched XML to local file:', writeErr);
            }
        } catch (error) {
            console.error('Failed to fetch XML from URL:', error);
            return;
        }
    }

    console.log('Parsing XML...');
    const parser = new XMLParser({
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

    products = items.map((item: any) => ({
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

async function getAIRecommendations(targetProduct: Product, allProducts: Product[], type: 'similar' | 'complementary'): Promise<string[]> {
    if (!model) return [];

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
        const skus = text.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        console.log(`AI recommended SKUs: ${skus.join(', ')}`);
        return skus;
    } catch (error) {
        console.error('AI recommendation error:', error);
        return [];
    }
}

function recommendBundle(target: Product, type: 'similar' | 'complementary'): Product[] {
    if (target.docIndex === undefined) return [];

    const combinedTargetText = (target.name + ' ' + target.description).toLowerCase();
    let recommendations: Product[] = [];

    // 1. Complementary Logic
    if (type === 'complementary') {
        const activeRule = RULES.find(rule =>
            rule.trigger.some(t => combinedTargetText.includes(t.toLowerCase()))
        );

        if (activeRule) {
            const validTargets = activeRule.targets.filter(t => !combinedTargetText.includes(t.toLowerCase()));
            const targetsToSearch = validTargets.length > 0 ? validTargets : activeRule.targets;

            const candidates = products.filter(p => {
                if (p.id === target.id) return false;
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
        const scores: { index: number, score: number }[] = [];

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
                if (recommendations.length >= 3) break;
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

    let bundle: Product[] = [];

    // Try AI recommendations first if available
    if (model) {
        try {
            const aiSkus = await getAIRecommendations(product, products, mode);
            bundle = aiSkus
                .map(sku => productMap.get(sku))
                .filter((p): p is Product => p !== undefined)
                .slice(0, 3)
                .map(p => ({ ...p, isComplementary: mode === 'complementary' }));

            console.log(`AI found ${bundle.length} products`);
        } catch (error) {
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
