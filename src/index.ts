// Simple MedMate service focusing on basic functionality
import { z } from "zod";
import axios from "axios";
import { defineDAINService } from "@dainprotocol/service-sdk";
import { DainResponse, CardUIBuilder } from "@dainprotocol/utils";

const port = Number(process.env.PORT) || 2022;
const BRAVE_API_KEY = "PASTE_YOUR_BRAVE_API_KEY_HERE";

// Common medical conditions for reference
const COMMON_CONDITIONS = [
  "Type 2 Diabetes",
  "Hypertension",
  "Hyperlipidemia",
  "GERD",
  "Sleep Apnea",
  "Osteoarthritis",
];

// Add a validation function for medication names
const KNOWN_MEDICATIONS = [
  "Metformin",
  "Glipizide",
  "Januvia",
  "Ozempic",
  "Jardiance",
  "Insulin",
  "Glyburide",
  "Trulicity",
  "Victoza",
  "Lisinopril",
  "Amlodipine",
  "Losartan",
  "Hydrochlorothiazide",
  "Atenolol",
  "Metoprolol",
  "Valsartan",
  "Diltiazem",
  "Atorvastatin",
  "Rosuvastatin",
  "Simvastatin",
  "Pravastatin",
  "Ezetimibe",
  "Fenofibrate",
  "Lovastatin",
  "Omeprazole",
  "Pantoprazole",
  "Famotidine",
  "Esomeprazole",
  "Ranitidine",
  "Lansoprazole",
  "Cimetidine",
  "CPAP",
  "BiPAP",
  "Modafinil",
  "Armodafinil",
  "Acetazolamide",
  "Inspire Therapy",
  "Acetaminophen",
  "Ibuprofen",
  "Naproxen",
  "Diclofenac",
  "Meloxicam",
  "Celecoxib",
  "Duloxetine",
  "Tramadol",
];

// Function to validate medication names
function isValidMedication(name) {
  // Check if it's in our known list
  if (
    KNOWN_MEDICATIONS.some((med) => med.toLowerCase() === name.toLowerCase())
  ) {
    return true;
  }

  // Check if it looks like a medication name (ends with common medication suffixes)
  const medSuffixes = [
    "in",
    "ol",
    "ide",
    "ine",
    "ate",
    "one",
    "il",
    "pril",
    "sartan",
    "statin",
    "mab",
    "zole",
    "prazole",
    "pam",
    "lol",
  ];
  if (medSuffixes.some((suffix) => name.toLowerCase().endsWith(suffix))) {
    return true;
  }

  return false;
}

// Replace the extractPrice function with a more reliable version
function extractPrice(text, isAlternative = false) {
  if (!text) return isAlternative ? "$30-$90" : "$10-$50";

  // Use more specific price patterns to avoid matching irrelevant currency symbols
  // Look for patterns like $X-$Y, $X to $Y, costs about $X
  const priceRangeRegex =
    /\$([\d,]+(\.\d+)?)\s*(-|to|and)\s*\$([\d,]+(\.\d+)?)/gi;
  const priceIndicators =
    /(?:cost|price|costs|priced|pricing|fee|charge|payment)s?\s+(?:of|is|are|about|around|approximately)?\s+\$([\d,]+(\.\d+)?)/gi;
  const singlePriceRegex = /\$([\d,]+(\.\d+)?)/gi;

  // First try to find a price range
  const rangeMatches = text.match(priceRangeRegex);
  if (rangeMatches && rangeMatches.length > 0) {
    // Use the first clear price range found
    return rangeMatches[0];
  }

  // Next try to find prices near words like "cost" or "price"
  let indicatorMatches = [];
  let match;
  while ((match = priceIndicators.exec(text)) !== null) {
    indicatorMatches.push(parseFloat(match[1].replace(/,/g, "")));
  }

  if (indicatorMatches.length > 0) {
    // If we have clear price indicators, use those
    if (indicatorMatches.length >= 2) {
      indicatorMatches.sort((a, b) => a - b);
      return `$${indicatorMatches[0]}-$${
        indicatorMatches[indicatorMatches.length - 1]
      }`;
    } else {
      // Create a range around the single found price
      const basePrice = indicatorMatches[0];
      const low = Math.max(1, Math.floor(basePrice * 0.7));
      const high = Math.ceil(basePrice * 1.3);
      return `$${low}-$${high}`;
    }
  }

  // If all else fails, extract any dollar amounts
  const allPrices = [];
  while ((match = singlePriceRegex.exec(text)) !== null) {
    const price = parseFloat(match[0].substring(1).replace(/,/g, ""));
    if (!isNaN(price) && price > 0 && price < 10000) {
      allPrices.push(price);
    }
  }

  if (allPrices.length >= 2) {
    allPrices.sort((a, b) => a - b);
    // Use the lowest and highest relevant prices
    // Filter out extremely high or low outliers
    const filtered = allPrices.filter(
      (price) =>
        price >= Math.min(...allPrices) * 0.5 &&
        price <= Math.max(...allPrices) * 2
    );
    if (filtered.length >= 2) {
      return `$${Math.floor(filtered[0])}-$${Math.ceil(
        filtered[filtered.length - 1]
      )}`;
    }
  } else if (allPrices.length === 1) {
    const basePrice = allPrices[0];
    const low = Math.max(1, Math.floor(basePrice * 0.7));
    const high = Math.ceil(basePrice * 1.3);
    return `$${low}-$${high}`;
  }

  // Default prices based on whether it's a medication or alternative
  if (isAlternative) {
    return "$10-$35"; // Most supplements are in this range
  } else {
    // Standard medications vary more by condition
    return "$15-$60"; // More realistic default for prescription medications
  }
}

// Simple condition normalization function
function normalizeCondition(conditionText) {
  const text = conditionText.toLowerCase();

  if (
    text.includes("diabetes") ||
    text.includes("type 2") ||
    text.includes("type ii")
  ) {
    return "Type 2 Diabetes";
  }
  if (text.includes("hypertension") || text.includes("high blood pressure")) {
    return "Hypertension";
  }
  if (
    text.includes("cholesterol") ||
    text.includes("lipid") ||
    text.includes("hyperlipidemia")
  ) {
    return "Hyperlipidemia";
  }
  if (
    text.includes("gerd") ||
    text.includes("acid reflux") ||
    text.includes("heartburn")
  ) {
    return "GERD";
  }
  if (text.includes("sleep apnea") || text.includes("osa")) {
    return "Sleep Apnea";
  }
  if (text.includes("arthritis") || text.includes("joint pain")) {
    return "Osteoarthritis";
  }

  return conditionText; // return original if no match
}

// Extract conditions from text
function extractConditionsFromText(text) {
  if (!text) return [];

  const conditions = [];
  const relevanceScores = new Map(); // Map to track relevance of each condition

  // Simple extraction - check if any known condition names appear in the text
  for (const condition of COMMON_CONDITIONS) {
    // Count occurrences to determine relevance
    const regex = new RegExp(condition.toLowerCase(), "gi");
    const matches = text.toLowerCase().match(regex);
    const occurrences = matches ? matches.length : 0;

    if (occurrences > 0) {
      conditions.push(condition);
      relevanceScores.set(condition, occurrences);
    }
  }

  // If we can't find exact matches, try normalizing potential condition mentions
  if (conditions.length === 0) {
    // Split by common separators
    const potentialConditions = text.split(/,|;|and|\.|treating|\bfor\b/);

    for (const potential of potentialConditions) {
      if (potential.trim().length > 0) {
        const normalized = normalizeCondition(potential.trim());
        if (
          COMMON_CONDITIONS.includes(normalized) &&
          !conditions.includes(normalized)
        ) {
          conditions.push(normalized);
          // Assign relevance score based on the position in the text (earlier = more relevant)
          const position = text.toLowerCase().indexOf(potential.toLowerCase());
          relevanceScores.set(normalized, 1000 - position); // Higher score for earlier mentions
        }
      }
    }
  }

  // Sort by relevance score and take the top 2
  return conditions
    .sort(
      (a, b) => (relevanceScores.get(b) || 0) - (relevanceScores.get(a) || 0)
    )
    .slice(0, 2);
}

// Extract medication names from search results
function extractMedicationsFromResults(results, count = 2) {
  const medications = [];
  const medicationRegex =
    /\b(aspirin|ibuprofen|metformin|lisinopril|atorvastatin|simvastatin|amlodipine|losartan|omeprazole|gabapentin|hydrochlorothiazide|metoprolol|albuterol|atenolol|montelukast|fluticasone|sertraline|escitalopram|levothyroxine|fluoxetine|citalopram|rosuvastatin|pantoprazole|lansoprazole|duloxetine|venlafaxine|tramadol|oxycodone|lorazepam|alprazolam|zolpidem|furosemide|clopidogrel|glipizide|sitagliptin|liraglutide|semaglutide|januvia|ozempic|warfarin|apixaban|rivaroxaban|dabigatran|sildenafil|tadalafil|cetirizine|loratadine|fexofenadine|symbicort|advair|trelegy|ezetimibe|fenofibrate|empagliflozin|jardiance|insulin|dapagliflozin|prednisone|testosterone|estradiol|norethindrone|medroxyprogesterone|diclofenac|naproxen|allopurinol|amoxicillin|azithromycin|ciprofloxacin|doxycycline|sumatriptan|rizatriptan|levetiracetam|valproic acid|lamotrigine|quetiapine|aripiprazole|risperidone|olanzapine|lurasidone|memantine|donepezil|dutasteride|finasteride|tamsulosin|cyclobenzaprine|methocarbamol|carvedilol|digoxin|spironolactone|valsartan|celecoxib|meloxicam|adalimumab|etanercept|ustekinumab|secukinumab|guselkumab|famotidine|ranitidine)\b/gi;

  // Process each search result
  for (const result of results) {
    // Extract any medication names from the result
    const matches = result.match(medicationRegex);
    if (matches) {
      // Add unique medication names to our list
      for (const med of matches) {
        const medName =
          med.charAt(0).toUpperCase() + med.slice(1).toLowerCase();
        if (!medications.includes(medName)) {
          medications.push(medName);
        }
      }
    }
  }

  // If we still don't have enough medications, try to extract any capitalized words
  // that might be medication names
  if (medications.length < count) {
    const possibleMedsRegex = /\b[A-Z][a-z]+\b/g;
    for (const result of results) {
      const matches = result.match(possibleMedsRegex);
      if (matches) {
        for (const med of matches) {
          // Exclude common words that aren't medications
          const commonWords = [
            "the",
            "and",
            "for",
            "with",
            "that",
            "have",
            "this",
            "from",
            "they",
            "will",
            "would",
            "there",
            "their",
            "what",
            "about",
            "which",
            "when",
            "make",
            "like",
            "time",
            "just",
            "know",
            "people",
            "year",
            "good",
            "some",
            "could",
            "them",
            "other",
            "than",
            "then",
            "now",
            "into",
            "only",
            "your",
            "very",
          ];
          if (
            !commonWords.includes(med.toLowerCase()) &&
            !medications.includes(med) &&
            med.length > 3
          ) {
            medications.push(med);
          }
        }
      }
    }
  }

  // Limit to requested count
  return medications.slice(0, count);
}

// Search the web using Brave Search API
async function performWebSearch(query) {
  try {
    console.log(`Searching for: ${query}`);

    // Add a delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1200)); // 1.2 second delay

    const response = await axios({
      method: "get",
      url: "https://api.search.brave.com/res/v1/web/search",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
      params: {
        q: query,
        count: 5,
        search_lang: "en",
        safesearch: "moderate",
      },
      timeout: 10000,
    });

    if (response.data?.web?.results?.length > 0) {
      const results = response.data.web.results.map((result) => {
        const title = result.title || "";
        const description = result.description || result.snippet || "";
        const url = result.url || "";
        return `${title}: ${description} [Source: ${url}]`;
      });
      return results;
    }

    return ["No search results found."];
  } catch (error) {
    console.error("Search API error:", error.message);
    // If we hit rate limiting, wait longer and try again
    if (error.response && error.response.status === 429) {
      console.log("Rate limited, waiting 2 seconds and retrying...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return performWebSearch(query); // Retry the request
    }
    return [`Error searching: ${error.message}`];
  }
}

// Add a function to search specifically for GoodRx pricing
async function searchGoodRxPricing(medicationName, condition) {
  // Format the medication name for search (replace spaces with hyphens for GoodRx URL format)
  const formattedMedName = medicationName.toLowerCase().replace(/\s+/g, "-");

  // Search for GoodRx pricing specifically
  const searchResults = await performWebSearch(
    `goodrx.com ${medicationName} price coupon`
  );

  // Look for GoodRx URLs in the results
  let goodRxUrl = "";
  let fullText = searchResults.join(" ");

  // Extract GoodRx URL with medication name
  const goodRxUrlRegex = /https?:\/\/www\.goodrx\.com\/[a-zA-Z0-9-]+/g;
  const urlMatches = fullText.match(goodRxUrlRegex);

  if (urlMatches && urlMatches.length > 0) {
    // Find the most relevant URL (one that contains the medication name if possible)
    const relevantUrls = urlMatches.filter(
      (url) =>
        url.toLowerCase().includes(formattedMedName) ||
        url
          .toLowerCase()
          .includes(medicationName.toLowerCase().replace(/\s+/g, ""))
    );

    goodRxUrl = relevantUrls.length > 0 ? relevantUrls[0] : urlMatches[0];

    // Make a secondary search to get the actual pricing information
    const pricingResults = await performWebSearch(
      `${goodRxUrl} price range lowest cost average`
    );

    fullText = pricingResults.join(" ");

    // Look for specific pricing patterns in GoodRx results
    const goodRxPriceRangeRegex =
      /prices range from \$([\d,]+(\.\d+)?)\s*(-|to|and)\s*\$([\d,]+(\.\d+)?)/gi;
    const goodRxPriceRegex = /as low as \$([\d,]+(\.\d+)?)/gi;
    const goodRxAverageRegex =
      /average price (?:of|is|about) \$([\d,]+(\.\d+)?)/gi;

    // Check for price range
    const rangeMatches = fullText.match(goodRxPriceRangeRegex);
    if (rangeMatches && rangeMatches.length > 0) {
      return {
        price: rangeMatches[0].replace(/prices range from /i, ""),
        source: goodRxUrl,
      };
    }

    // Check for "as low as" pricing
    const lowPriceMatches = fullText.match(goodRxPriceRegex);
    if (lowPriceMatches && lowPriceMatches.length > 0) {
      // Convert "as low as $X" to a range by assuming high end is 3x
      const lowPrice = parseFloat(
        lowPriceMatches[0].replace(/as low as \$/i, "")
      );
      const highPrice = Math.ceil(lowPrice * 3);
      return {
        price: `$${lowPrice}-$${highPrice}`,
        source: goodRxUrl,
      };
    }

    // Check for average price
    const avgPriceMatches = fullText.match(goodRxAverageRegex);
    if (avgPriceMatches && avgPriceMatches.length > 0) {
      // Convert average price to a range by assuming +/- 30%
      const avgPrice = parseFloat(
        avgPriceMatches[0].replace(/average price (?:of|is|about) \$/i, "")
      );
      const lowPrice = Math.floor(avgPrice * 0.7);
      const highPrice = Math.ceil(avgPrice * 1.3);
      return {
        price: `$${lowPrice}-$${highPrice}`,
        source: goodRxUrl,
      };
    }

    // If we have a URL but couldn't extract specific pricing
    return {
      price: null,
      source: goodRxUrl,
    };
  }

  // If no GoodRx URL found
  return {
    price: null,
    source: null,
  };
}

// Update the description to use proper Markdown links instead of HTML
function createMedicationCard(conditions, medicationsByCondition) {
  let content = `# Medication Options\n\n`;

  for (const condition of conditions) {
    content += `## ${condition}\n\n`;

    // Create a table for comparing medications
    content +=
      "| Medication | Information | Treatment Type | Price Category | Price |\n";
    content +=
      "|------------|-------------|---------------|----------------|-------|\n";

    const medications = medicationsByCondition[condition] || [];

    for (const med of medications) {
      // Convert HTML links to Markdown links for better compatibility
      let infoCell = med.description;

      // If it's an HTML link, convert to Markdown
      if (infoCell.includes("<a href")) {
        const linkMatch = infoCell.match(
          /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/i
        );
        if (linkMatch) {
          const [_, url, text] = linkMatch;
          infoCell = `[${text}](${url})`;
        }
      }
      // If we have a direct link but no formatted link yet
      else if (med.link && med.link.startsWith("http")) {
        infoCell = `[Learn about ${med.name}](${med.link})`;
      }
      // Fallback if no link is available
      else if (!infoCell.includes("[") && !infoCell.includes("](")) {
        infoCell = `Used for ${condition}`;
      }

      // If we have a price from GoodRx, add an indicator
      let priceCell = med.price;
      if (
        med.priceSource &&
        med.priceSource !== "estimated" &&
        med.priceSource.includes("goodrx")
      ) {
        priceCell = `${med.price} [GoodRx]`;
      }

      content += `| **${med.name}** | ${infoCell} | ${med.category} | ${med.priceCategory} | ${priceCell} |\n`;
    }

    content += "\n";
  }

  // Update description for price legend to mention GoodRx
  content += "\n## Price Legend\n";
  content += "* 💰 = Affordable (Less than $25)\n";
  content += "* 💰💰 = Moderate cost ($25-$75)\n";
  content += "* 💰💰💰 = Expensive ($75-$300)\n";
  content += "* 💰💰💰💰 = Very expensive (Over $300)\n";
  content += "* [GoodRx] = Price data sourced from GoodRx\n\n";
  content +=
    "*Disclaimer: Prices are approximate and may vary based on location, insurance, and pharmacy. Generic medications typically cost less than brand-name versions. Consult your healthcare provider for medical advice.*\n\n";
  content +=
    "*Standard treatments are common first-line medications, while Conservative options represent alternatives that may have different mechanisms, side effect profiles, or natural approaches.*";

  return new CardUIBuilder()
    .title("Medication Comparison")
    .content(content)
    .build();
}

// Update the extractMedicationLink function to ensure it returns clean URLs
function extractMedicationLink(fullText, medicationName) {
  if (!fullText) return "";

  // Try to find a URL in the text
  const urlRegex = /https?:\/\/[^\s\])"'>]+/g;
  const urlMatches = fullText.match(urlRegex);

  if (urlMatches && urlMatches.length > 0) {
    // Filter to use medical/health URLs when possible
    const medicalUrls = urlMatches.filter(
      (url) =>
        url.includes("nih.gov") ||
        url.includes("mayo") ||
        url.includes("webmd") ||
        url.includes("medline") ||
        url.includes("drugs.com") ||
        url.includes("rxlist") ||
        url.includes("medscape") ||
        url.includes("health")
    );

    if (medicalUrls.length > 0) {
      // Clean the URL to remove any trailing characters that might break the link
      return medicalUrls[0].replace(/[,."')\]]+$/, "");
    }

    // Return first URL if no medical URLs found (cleaned)
    return urlMatches[0].replace(/[,."')\]]+$/, "");
  }

  // If no URL found, return empty string
  return "";
}

// Update the find medications function to incorporate GoodRx pricing
async function findMedicationsForCondition(condition) {
  try {
    // Search for standard medications
    const standardResults = await performWebSearch(
      `most common first-line medications for ${condition} treatment`
    );
    const standardMeds = extractMedicationsFromResults(standardResults, 4)
      .filter((med) => isValidMedication(med))
      .slice(0, 2); // Filter valid medications and limit to 2

    // If we don't have any valid medications, try more specific searches
    if (standardMeds.length === 0) {
      const specificSearchResults = await performWebSearch(
        `FDA approved medications for ${condition}`
      );
      const specificMeds = extractMedicationsFromResults(
        specificSearchResults,
        4
      )
        .filter((med) => isValidMedication(med))
        .slice(0, 2);

      if (specificMeds.length > 0) {
        standardMeds.push(...specificMeds);
      } else {
        // Add default medications based on condition
        switch (condition.toLowerCase()) {
          case "type 2 diabetes":
          case "diabetes":
            standardMeds.push("Metformin", "Glipizide");
            break;
          case "hypertension":
          case "high blood pressure":
            standardMeds.push("Lisinopril", "Amlodipine");
            break;
          case "hyperlipidemia":
          case "high cholesterol":
            standardMeds.push("Atorvastatin", "Rosuvastatin");
            break;
          case "gerd":
          case "acid reflux":
            standardMeds.push("Omeprazole", "Famotidine");
            break;
          case "sleep apnea":
            standardMeds.push("CPAP Therapy", "Modafinil");
            break;
          case "osteoarthritis":
          case "arthritis":
            standardMeds.push("Acetaminophen", "Meloxicam");
            break;
          default:
            standardMeds.push("Medication 1", "Medication 2");
        }
      }
    }

    // Get descriptions for the standard medications, but limit concurrent API calls
    const standardMedsWithDetails = [];
    for (const med of standardMeds) {
      // Process one medication at a time to avoid rate limiting
      const medResults = await performWebSearch(
        `${med} medication guide information ${condition}`
      );

      // Extract a link from the search results
      let description = `${med} is a medication used for ${condition}`;
      let link = "";
      let fullText = "";

      if (medResults.length > 0) {
        fullText = medResults.join(" ");
        link = extractMedicationLink(fullText, med);

        // If we have a link, create a Markdown link for the description
        if (link) {
          description = `[Learn about ${med}](${link})`;
        }
      }

      // Search for GoodRx pricing data
      const goodRxData = await searchGoodRxPricing(med, condition);

      // Use GoodRx price if available, otherwise fall back to extracted price
      let price;
      if (goodRxData.source && goodRxData.price) {
        price = goodRxData.price;

        // If we have a GoodRx source but the description doesn't have a link yet, use GoodRx
        if (!link && goodRxData.source) {
          description = `[Check ${med} pricing](${goodRxData.source})`;
          link = goodRxData.source;
        }
        // Or we could add a separate pricing link
        else if (link && goodRxData.source) {
          description += ` • [Check pricing](${goodRxData.source})`;
        }
      } else {
        price = extractPrice(fullText);
      }

      standardMedsWithDetails.push({
        name: med,
        description: description,
        link: link,
        price,
        priceSource: goodRxData.source || "estimated",
        category: "Standard",
      });
    }

    // Search for conservative/alternative medications
    const alternativeResults = await performWebSearch(
      `alternative or natural treatments for ${condition} without medication`
    );

    // Extract alternative treatments, which could be non-pharmaceutical
    let alternativeMeds = extractMedicationsFromResults(
      alternativeResults,
      4
    ).slice(0, 2);

    // If we don't get valid medication names from alternatives, look for supplements or lifestyle options
    if (
      alternativeMeds.length === 0 ||
      !alternativeMeds.some((med) => isValidMedication(med))
    ) {
      // Extract capitalized words that might be supplements or treatments
      const nonMedRegex = /\b([A-Z][a-z]{2,})\b/g;
      const allMatches = [];
      for (const result of alternativeResults) {
        const matches = [...result.matchAll(nonMedRegex)].map((m) => m[1]);
        allMatches.push(...matches);
      }

      // Filter out common words and names
      const commonWords = [
        "The",
        "And",
        "For",
        "With",
        "That",
        "This",
        "From",
        "They",
        "Will",
        "What",
        "About",
        "Which",
        "When",
        "Their",
        "Have",
        "Been",
        "Were",
        "Being",
        "More",
        "Most",
        "Some",
        "Such",
        "Many",
      ];
      alternativeMeds = Array.from(new Set(allMatches))
        .filter((word) => !commonWords.includes(word) && word.length > 3)
        .slice(0, 2);

      // If still empty, use defaults based on condition
      if (alternativeMeds.length === 0) {
        switch (condition.toLowerCase()) {
          case "type 2 diabetes":
          case "diabetes":
            alternativeMeds.push("Cinnamon", "Chromium");
            break;
          case "hypertension":
          case "high blood pressure":
            alternativeMeds.push("Potassium", "CoQ10");
            break;
          case "hyperlipidemia":
          case "high cholesterol":
            alternativeMeds.push("Fish Oil", "Plant Sterols");
            break;
          case "gerd":
          case "acid reflux":
            alternativeMeds.push("Ginger", "Probiotics");
            break;
          case "sleep apnea":
            alternativeMeds.push("Weight Loss", "Positional Therapy");
            break;
          case "osteoarthritis":
          case "arthritis":
            alternativeMeds.push("Glucosamine", "Turmeric");
            break;
          default:
            alternativeMeds.push("Supplement", "Lifestyle Change");
        }
      }
    }

    // Get descriptions for the alternative treatments, one at a time
    const alternativeMedsWithDetails = [];
    for (const med of alternativeMeds) {
      // Process one medication at a time to avoid rate limiting
      const medResults = await performWebSearch(
        `${med} ${condition} treatment guide information`
      );

      // Extract a link from the search results
      let description = `${med} is an alternative treatment for ${condition}`;
      let link = "";
      let fullText = "";

      if (medResults.length > 0) {
        fullText = medResults.join(" ");
        link = extractMedicationLink(fullText, med);

        // If we have a link, create a Markdown link for the description
        if (link) {
          description = `[Learn about ${med}](${link})`;
        }
      }

      // Try to extract price, typically alternatives are cheaper
      const price = extractPrice(fullText, true);

      alternativeMedsWithDetails.push({
        name: med,
        description: description,
        link: link,
        price,
        category: "Conservative",
      });
    }

    // Return both standard and conservative options
    return [...standardMedsWithDetails, ...alternativeMedsWithDetails];
  } catch (error) {
    console.error(`Error finding medications for ${condition}:`, error);
    // Return fallback medications based on condition with more realistic prices
    let standardMed = `Medication for ${condition}`;
    let alternativeMed = `Alternative for ${condition}`;
    let standardPrice = "$15-$60";
    let alternativePrice = "$20-$45";

    switch (condition.toLowerCase()) {
      case "type 2 diabetes":
      case "diabetes":
        standardMed = "Metformin";
        alternativeMed = "Cinnamon Supplements";
        standardPrice = "$4-$25"; // Metformin is typically inexpensive
        alternativePrice = "$15-$35";
        break;
      case "hypertension":
      case "high blood pressure":
        standardMed = "Lisinopril";
        alternativeMed = "Potassium Supplements";
        standardPrice = "$8-$30";
        alternativePrice = "$10-$40";
        break;
      case "hyperlipidemia":
      case "high cholesterol":
        standardMed = "Atorvastatin";
        alternativeMed = "Fish Oil";
        standardPrice = "$12-$75"; // Atorvastatin can vary in price
        alternativePrice = "$15-$45";
        break;
      case "gerd":
      case "acid reflux":
        standardMed = "Omeprazole";
        alternativeMed = "Ginger Extract";
        standardPrice = "$10-$35";
        alternativePrice = "$12-$30";
        break;
      case "sleep apnea":
        standardMed = "CPAP Therapy";
        alternativeMed = "Positional Therapy";
        standardPrice = "$500-$1200"; // CPAP machines are expensive
        alternativePrice = "$80-$200";
        break;
      case "osteoarthritis":
      case "arthritis":
        standardMed = "Acetaminophen";
        alternativeMed = "Glucosamine";
        standardPrice = "$5-$25";
        alternativePrice = "$20-$60";
        break;
    }

    return [
      {
        name: standardMed,
        description: `[Learn about ${standardMed}](https://medlineplus.gov/druginfo/meds/)`,
        link: "https://medlineplus.gov/druginfo/meds/",
        price: standardPrice,
        category: "Standard",
      },
      {
        name: alternativeMed,
        description: `[Learn about ${alternativeMed}](https://www.nccih.nih.gov/health/)`,
        link: "https://www.nccih.nih.gov/health/",
        price: alternativePrice,
        category: "Conservative",
      },
    ];
  }
}

// Helper function to categorize medications by price - update thresholds
function categorizeMedication(medication) {
  const priceStr = medication.price;

  // Extract the lower price value when range is given (e.g. "$10-$50" -> 10)
  const priceMatch = priceStr.match(/\$(\d+)/);
  const price = priceMatch ? parseInt(priceMatch[1]) : 0;

  // Update price category thresholds to be more realistic
  if (price < 25) {
    return { ...medication, priceCategory: "💰 Affordable" };
  } else if (price < 75) {
    return { ...medication, priceCategory: "💰💰 Moderate cost" };
  } else if (price < 300) {
    return { ...medication, priceCategory: "💰💰💰 Expensive" };
  } else {
    return { ...medication, priceCategory: "💰💰💰💰 Very expensive" };
  }
}

// The main tool configuration
const analyzeMedicalHistoryConfig = {
  id: "analyze-medical-history",
  name: "Analyze Medical History",
  description: "Provides treatment information for medical conditions.",
  input: z.object({
    primaryConcern: z
      .string()
      .optional()
      .describe("Primary health concern to address"),
    dainIdentifiedConditions: z
      .array(z.string())
      .optional()
      .describe("Conditions identified by DAIN AI"),
    dainIdentifiedMedications: z
      .array(z.string())
      .optional()
      .describe("Medications identified by DAIN AI from documents"),
  }),
  output: z.object({
    conditions: z.array(z.string()).describe("Identified medical conditions"),
    treatmentOptions: z
      .array(
        z.object({
          condition: z.string().describe("The medical condition"),
          conservative: z
            .object({
              treatments: z
                .array(z.string())
                .describe("Standard treatment options"),
              lifestyle: z
                .array(z.string())
                .describe("Lifestyle recommendations"),
              alternatives: z
                .array(z.string())
                .describe("Conservative alternatives"),
            })
            .describe("Conservative approach options"),
          radical: z.array(z.string()).describe("Advanced treatment options"),
        })
      )
      .describe("Treatment recommendations"),
    searchedTimestamp: z.string().describe("When information was retrieved"),
  }),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async (inputs, completion) => {
    try {
      // Extract conditions from inputs
      let allConditions = [];

      // First try to use DAIN-identified conditions
      if (
        inputs.dainIdentifiedConditions &&
        inputs.dainIdentifiedConditions.length > 0
      ) {
        allConditions = inputs.dainIdentifiedConditions;
        console.log("Using DAIN-identified conditions:", allConditions);
      }
      // Then try to extract from primary concern
      else if (inputs.primaryConcern) {
        allConditions = extractConditionsFromText(inputs.primaryConcern);
        console.log(
          "Extracted conditions from primary concern:",
          allConditions
        );
      }

      // Limit to the 2 most relevant conditions
      const conditions = allConditions.slice(0, 2);

      // Check if we found any conditions
      if (conditions.length === 0) {
        throw new Error(
          "No medical conditions identified. Please provide specific conditions."
        );
      }

      // Update the user on progress
      if (completion && typeof completion.update === "function") {
        completion.update({
          text: `Analyzing ${
            conditions.length
          } most relevant conditions: ${conditions.join(", ")}`,
          ui: new CardUIBuilder()
            .title("Analyzing Medical Conditions")
            .content(`Processing information for: ${conditions.join(", ")}`)
            .build(),
        });
      }

      // Process medications for each condition by searching
      const medicationsByCondition = {};
      const formattedTreatmentOptions = [];

      for (const condition of conditions) {
        let medications = [];

        // Check if DAIN identified medications and use them if available
        if (
          inputs.dainIdentifiedMedications &&
          inputs.dainIdentifiedMedications.length > 0
        ) {
          console.log(
            "Using DAIN-identified medications:",
            inputs.dainIdentifiedMedications
          );

          // Filter identified medications to keep only valid ones
          const validDainMeds = inputs.dainIdentifiedMedications
            .filter(
              (med) =>
                isValidMedication(med) ||
                KNOWN_MEDICATIONS.some((known) =>
                  med.toLowerCase().includes(known.toLowerCase())
                )
            )
            .slice(0, 2); // Limit to 2 medications

          // If no valid medications found in DAIN's list, use our search
          if (validDainMeds.length === 0) {
            medications = await findMedicationsForCondition(condition);
          } else {
            // For each DAIN-identified medication, find link and price
            const dainMedsWithDetails = [];
            for (const med of validDainMeds) {
              // Process one medication at a time to avoid rate limiting
              const medResults = await performWebSearch(
                `${med} medication guide information ${condition}`
              );

              // Extract a link from the search results
              let description = `${med} is a medication used for ${condition}`;
              let link = "";
              let fullText = "";

              if (medResults.length > 0) {
                fullText = medResults.join(" ");
                link = extractMedicationLink(fullText, med);

                // If we have a link, create a Markdown link for the description
                if (link) {
                  description = `[Learn about ${med}](${link})`;
                }
              }

              // Search for GoodRx pricing data
              const goodRxData = await searchGoodRxPricing(med, condition);

              // Use GoodRx price if available, otherwise fall back to extracted price
              let price;
              if (goodRxData.source && goodRxData.price) {
                price = goodRxData.price;

                // If we have a GoodRx source but the description doesn't have a link yet, use GoodRx
                if (!link && goodRxData.source) {
                  description = `[Check ${med} pricing](${goodRxData.source})`;
                  link = goodRxData.source;
                }
                // Or we could add a separate pricing link
                else if (link && goodRxData.source) {
                  description += ` • [Check pricing](${goodRxData.source})`;
                }
              } else {
                price = extractPrice(fullText);
              }

              dainMedsWithDetails.push({
                name: med,
                description: description,
                link: link,
                price,
                priceSource: goodRxData.source || "estimated",
                category: "Standard",
              });
            }

            // Get conservative alternatives for the identified medications
            const alternativeMedsWithDetails = [];
            for (const med of validDainMeds) {
              const alternativeResults = await performWebSearch(
                `natural alternative to ${med} for ${condition} without medication`
              );

              // Extract alternatives that may not be medications
              const nonMedRegex = /\b([A-Z][a-z]{2,})\b/g;
              const allMatches = [];
              for (const result of alternativeResults) {
                const matches = [...result.matchAll(nonMedRegex)].map(
                  (m) => m[1]
                );
                allMatches.push(...matches);
              }

              // Filter out common words
              const commonWords = [
                "The",
                "And",
                "For",
                "With",
                "That",
                "This",
                "From",
                "They",
                "Will",
                "What",
                "About",
                "Which",
                "When",
                "Their",
                "Have",
                "Been",
                "Were",
                "Being",
                "More",
                "Most",
                "Some",
                "Such",
                "Many",
              ];
              const alternatives = Array.from(new Set(allMatches))
                .filter(
                  (word) => !commonWords.includes(word) && word.length > 3
                )
                .slice(0, 1);

              if (alternatives.length > 0) {
                const altMed = alternatives[0];
                // Get link
                const medResults = await performWebSearch(
                  `${altMed} ${condition} treatment guide information`
                );

                // Extract a link from the search results
                let description = `${altMed} is an alternative treatment for ${condition}`;
                let link = "";
                let fullText = "";

                if (medResults.length > 0) {
                  fullText = medResults.join(" ");
                  link = extractMedicationLink(fullText, altMed);

                  // If we have a link, create a Markdown link for the description
                  if (link) {
                    description = `[Learn about ${altMed}](${link})`;
                  }
                }

                // Extract price
                const price = extractPrice(fullText, true);

                alternativeMedsWithDetails.push({
                  name: altMed,
                  description: description,
                  link: link,
                  price,
                  category: "Conservative",
                });
              }
            }

            medications = [
              ...dainMedsWithDetails,
              ...alternativeMedsWithDetails,
            ];
          }
        } else {
          // Fall back to searching if no DAIN-identified medications
          medications = await findMedicationsForCondition(condition);
        }

        // Categorize the medications with price categories
        const categorizedMeds = medications.map((med) =>
          categorizeMedication(med)
        );
        medicationsByCondition[condition] = categorizedMeds;

        // Format data for the output schema
        const standardMeds = categorizedMeds
          .filter((med) => med.category === "Standard")
          .map(
            (med) =>
              `${med.name}: ${med.description} (${med.priceCategory} - ${med.price})`
          );

        const conservativeMeds = categorizedMeds
          .filter((med) => med.category === "Conservative")
          .map(
            (med) =>
              `${med.name}: ${med.description} (${med.priceCategory} - ${med.price})`
          );

        // Update progress for each condition
        if (completion && typeof completion.update === "function") {
          completion.update({
            text: `Analyzed ${conditions.indexOf(condition) + 1} of ${
              conditions.length
            } conditions...`,
          });
        }

        formattedTreatmentOptions.push({
          condition,
          conservative: {
            treatments:
              standardMeds.length > 0
                ? standardMeds
                : [`Standard treatment for ${condition}`],
            lifestyle: [
              `Diet: Appropriate nutrition can help manage ${condition}`,
              `Exercise: Regular physical activity tailored to your health status`,
            ],
            alternatives:
              conservativeMeds.length > 0
                ? conservativeMeds
                : [`Conservative option for ${condition}`],
          },
          radical: [], // We're not using radical options as requested
        });
      }

      // Create the UI card with medication comparisons
      const medicationCard = createMedicationCard(
        conditions,
        medicationsByCondition
      );

      // Return the full response
      return new DainResponse({
        text: `Analysis of ${
          conditions.length
        } conditions complete: ${conditions.join(", ")}`,
        ui: medicationCard,
        data: {
          conditions,
          treatmentOptions: formattedTreatmentOptions,
          searchedTimestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Error in handler:", error);
      return new DainResponse({
        text: `Error analyzing medical conditions: ${error.message}`,
        ui: new CardUIBuilder()
          .title("Analysis Error")
          .content(
            `${error.message}\n\nPlease try again with specific condition names like "Type 2 Diabetes" or "Hypertension".`
          )
          .build(),
        data: {
          conditions: [],
          treatmentOptions: [],
          searchedTimestamp: new Date().toISOString(),
        },
      });
    }
  },
};

// Define the service
const dainService = defineDAINService({
  metadata: {
    title: "MedMate - Medical Treatment Finder",
    description: "Find treatment options for medical conditions",
    version: "1.0.0",
    author: "MedMate Team",
    tags: ["medical", "health", "treatments"],
    logo: "https://cdn-icons-png.flaticon.com/512/4320/4320371.png",
  },
  exampleQueries: [
    {
      category: "Medical Conditions",
      queries: [
        "What are the treatment options for hypertension?",
        "Find medications for Type 2 Diabetes",
        "What treatments are available for GERD?",
        "Show me options for treating osteoarthritis",
      ],
    },
  ],
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  tools: [analyzeMedicalHistoryConfig],
});

// Start the service
dainService.startNode({ port: port }).then(({ address }) => {
  console.log("MedMate Service is running at port:", address().port);
});
