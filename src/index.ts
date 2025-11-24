import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import * as readline from 'readline';
import { TfIdf } from 'natural';

const XML_PATH = path.join(__dirname, '../insider.xml');

interface Product {
    id: string;
    name: string;
    description: string;
    raw: any;
    docIndex?: number;
    isComplementary?: boolean;
}

async function main() {
    if (!fs.existsSync(XML_PATH)) {
        console.error(`File not found: ${XML_PATH}`);
        return;
    }

    console.log('Reading XML file...');
    const xmlData = fs.readFileSync(XML_PATH, 'utf-8');

    console.log('Parsing XML...');
    const parser = new XMLParser({
        ignoreAttributes: false,
        ignoreDeclaration: true,
        removeNSPrefix: true // This will turn g:id into id
    });
    const jsonObj = parser.parse(xmlData);

    // Navigate to items. Usually rss -> channel -> item
    let items = jsonObj.rss?.channel?.item;
    if (!items) {
        // Try finding items if structure is different
        console.log('Standard RSS structure not found. Inspecting root keys:', Object.keys(jsonObj));
        if (jsonObj.rss && jsonObj.rss.channel) {
            console.log('Channel keys:', Object.keys(jsonObj.rss.channel));
        }
        return;
    }

    if (!Array.isArray(items)) {
        items = [items];
    }

    console.log(`Found ${items.length} products.`);

    // Map to our Product interface
    const products: Product[] = items.map((item: any) => ({
        id: item.id,
        name: item.custom_label_3 || item.title, // Fallback to title if label_3 missing
        description: item.description || '',
        raw: item
    }));

    // Index by ID
    const productMap = new Map<string, Product>();
    products.forEach(p => productMap.set(p.id, p));

    // Build TF-IDF
    console.log('Building TF-IDF index (this may take a moment)...');
    const tfidf = new TfIdf();
    products.forEach((p, index) => {
        // Combine name and description for better context
        // You might want to weight name higher by repeating it
        const content = `${p.name} ${p.name} ${p.description}`;
        tfidf.addDocument(content);
        p.docIndex = index;
    });
    console.log('TF-IDF index built.');

    // Print some random SKUs for testing
    console.log('\nSample SKUs to try:');
    for (let i = 0; i < 5; i++) {
        const p = products[Math.floor(Math.random() * products.length)];
        console.log(`- ${p.id} (${p.name})`);
    }

    // Interactive loop
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askSku = () => {
        rl.question('\nEnter SKU (g:id) to get bundle suggestions (or "exit"): ', (sku) => {
            if (sku.toLowerCase() === 'exit') {
                rl.close();
                return;
            }

            const product = productMap.get(sku.trim());
            if (!product) {
                console.log('Product not found!');
                askSku();
                return;
            }

            console.log(`\nSelected Product: ${product.name} (${product.id})`);
            // console.log(`Description: ${product.description.substring(0, 100)}...`);

            const bundle = recommendBundle(product, products, tfidf);

            console.log('\nRecommended Bundle:');
            bundle.forEach((p, index) => {
                const type = p.isComplementary ? '(Complementary)' : '(Similar)';
                console.log(`${index + 1}. ${p.name} (${p.id}) ${type}`);
            });

            askSku();
        });
    };

    askSku();
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

function recommendBundle(target: Product, allProducts: Product[], tfidf: TfIdf): (Product & { isComplementary?: boolean })[] {
    if (target.docIndex === undefined) return [];

    const combinedTargetText = (target.name + ' ' + target.description).toLowerCase();

    // 1. Find Complementary Products
    let complementaryProducts: Product[] = [];

    // Check which rule applies
    const activeRule = RULES.find(rule =>
        rule.trigger.some(t => combinedTargetText.includes(t.toLowerCase()))
    );

    if (activeRule) {
        // console.log(`Matched Rule: ${activeRule.trigger[0]} -> ${activeRule.targets.join(', ')}`);

        // Filter out targets that are already in the product name (e.g. don't recommend "Ironing Board" for an "Ironing Board")
        const validTargets = activeRule.targets.filter(t => !combinedTargetText.includes(t.toLowerCase()));

        // If we filtered everything out (e.g. product has all keywords), maybe we shouldn't recommend anything from this rule?
        // Or maybe we should keep them? Let's try to keep them if validTargets is empty, but usually it implies we are looking at the "target" item itself.
        const targetsToSearch = validTargets.length > 0 ? validTargets : activeRule.targets;

        // Find products that match target keywords
        // We shuffle or sample to avoid always showing the same ones
        const candidates = allProducts.filter(p => {
            if (p.id === target.id) return false;
            const text = (p.name + ' ' + p.description).toLowerCase();
            return targetsToSearch.some(t => text.includes(t.toLowerCase()));
        });

        if (candidates.length > 0) {
            // Pick 1 random complementary product
            const randomComp = candidates[Math.floor(Math.random() * candidates.length)];
            complementaryProducts.push(randomComp);
        }
    }

    // 2. Find Similar Products (TF-IDF)
    const query = `${target.name} ${target.name} ${target.description}`;
    const scores: { index: number, score: number }[] = [];

    tfidf.tfidfs(query, (i, measure) => {
        if (i !== target.docIndex) {
            scores.push({ index: i, score: measure });
        }
    });

    scores.sort((a, b) => b.score - a.score);

    // Filter out products already selected as complementary
    const compIds = new Set(complementaryProducts.map(c => c.id));

    const similarProducts: Product[] = [];
    for (const s of scores) {
        const p = allProducts[s.index];
        if (!compIds.has(p.id) && similarProducts.length < (3 - complementaryProducts.length)) {
            similarProducts.push(p);
        }
        if (similarProducts.length >= (3 - complementaryProducts.length)) break;
    }

    // Combine: Complementary first, then Similar
    return [
        ...complementaryProducts.map(p => ({ ...p, isComplementary: true })),
        ...similarProducts.map(p => ({ ...p, isComplementary: false }))
    ];
}

main().catch(console.error);
