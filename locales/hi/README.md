<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AIOrchestrator.ai-orchestrator"><img src="https://img.shields.io/badge/VS_Code_Marketplace-007ACC?style=flat&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
</p>

# AI Code Orchestrator

> तुम्हारी AI-संचालित डेवलपमेंट टीम, सीधे तुम्हारे एडिटर में।

AI Code Orchestrator कॉन्फ़िगर किए जा सकने वाले AI एजेंट्स के साथ सॉफ़्टवेयर की योजना बनाने, उसे लागू करने, समीक्षा करने और समझाने वाला VS Code एक्सटेंशन और CLI है। यह एक ही वर्कस्पेस में चैट, कोड एक्शन, टर्मिनल वर्कफ़्लो, कस्टम रोल, MCP इंटीग्रेशन और multi-agent orchestration को जोड़ता है।

## क्षमताएँ

- प्राकृतिक भाषा की आवश्यकताओं से कोड बनाना और बदलना
- आर्किटेक्चर की योजना बनाना और काम को समन्वित कार्यों में बाँटना
- dependency-aware DAG के रूप में काम का orchestration, जिसमें parallel executors, review stages, budgets और नियंत्रित integration शामिल हैं
- **कॉन्टेक्स्ट ऑप्टिमाइज़ेशन** — बुद्धिमान कॉन्टेक्स्ट प्रबंधन प्रभावशीलता बनाए रखते हुए टोकन उपयोग और लागत कम करता है
- बदलावों की समीक्षा, विफलताओं का निदान और मौजूदा कोड में सुधार
- फ़ाइलों, टर्मिनल, इमेज और बाहरी MCP टूल्स के साथ काम करना
- Vercel AI Gateway और Unbound सहित providers, models, permissions और custom roles कॉन्फ़िगर करना
- अलग-अलग roles को models देना; override न होने पर primary model से automatic inheritance
- एडिटर या कमांड लाइन से tasks जारी रखना

## भूमिकाएँ

AI Code Orchestrator आपके काम के अनुसार ढलता है:

- **Code** — बदलाव लागू करना और प्रोजेक्ट फ़ाइलों पर काम करना
- **Architect** — सिस्टम, specifications और migrations डिज़ाइन करना
- **Ask** — सवालों के जवाब देना और कोड समझाना
- **Debug** — मूल कारण अलग करना और fixes को validate करना
- **Reviewer** — बदलावों को validate करना, समस्याएँ पहचानना और quality सुनिश्चित करना
- **Orchestrator** — dependency-aware task graphs और parallel agents का समन्वय; यह default role है
- **Translate** — स्थानीयकरण फ़ाइलों का अनुवाद और प्रबंधन करना
- **Custom** — टीम के लिए विशेष workflows बनाना

हर role अपनी model configuration इस्तेमाल कर सकता है। Role-specific model न होने पर primary model inherit होता है, जिससे workflow में capability, speed और cost का संतुलन आसान होता है।

## दस्तावेज़ीकरण

Orchestration specification सहित प्रोजेक्ट का documentation [`apps/docs`](../../apps/docs) में है।

## इंस्टॉलेशन

VS Code Marketplace से **AI Code Orchestrator** extension इंस्टॉल करें या स्थानीय रूप से VSIX बनाएँ:

```bash
pnpm install
pnpm rebuild:vsix
```

Development के दौरान CLI monorepo से उपलब्ध है:

```bash
pnpm --filter @ai-code-orchestrator/cli dev
```

मौजूदा integrations के साथ compatibility के लिए package scope और legacy command identifiers बनाए रखे गए हैं।

## श्रेय

AI Code Orchestrator [Roo Code](https://github.com/RooCodeInc/Roo-Code) पर आधारित है। मौजूदा integrations के काम करते रहने के लिए कुछ compatible APIs और identifiers बनाए रखे गए हैं।

## लाइसेंस

[Apache 2.0](../../LICENSE)
