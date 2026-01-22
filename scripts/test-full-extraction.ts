/**
 * Test script to verify full recursive XML extraction
 * Run with: npx tsx scripts/test-full-extraction.ts
 */

import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

function deepParseAllXml(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (typeof val === 'string' && val.trim().startsWith('<?xml') || 
            (typeof val === 'string' && val.trim().startsWith('<') && val.trim().endsWith('>'))) {
            try {
                const parsed = parser.parse(val);
                obj[key] = parsed;
                deepParseAllXml(obj[key]);
            } catch (_e) {
                // Not valid XML
            }
        } else if (Array.isArray(val)) {
            val.forEach(item => deepParseAllXml(item));
        } else if (typeof val === 'object') {
            deepParseAllXml(val);
        }
    });
}

function countNestedObjects(obj: any, depth = 0): { maxDepth: number; totalKeys: number; xmlParsedFields: string[] } {
    if (!obj || typeof obj !== 'object') return { maxDepth: depth, totalKeys: 0, xmlParsedFields: [] };
    
    let maxDepth = depth;
    let totalKeys = 0;
    const xmlParsedFields: string[] = [];
    
    const keys = Object.keys(obj);
    totalKeys += keys.length;
    
    for (const key of keys) {
        const val = obj[key];
        if (typeof val === 'object' && val !== null) {
            // Check if this was a parsed XML field (has typical XML structure)
            if (val.StorageObject || val.TableDefinition || val.DataModelDefinition || 
                val.CriteriaSetItem || val.Parameters || val.QueryDefinition) {
                xmlParsedFields.push(key);
            }
            const nested = countNestedObjects(val, depth + 1);
            maxDepth = Math.max(maxDepth, nested.maxDepth);
            totalKeys += nested.totalKeys;
            xmlParsedFields.push(...nested.xmlParsedFields);
        }
    }
    
    return { maxDepth, totalKeys, xmlParsedFields };
}

async function testETL(filePath: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`ETL FILE: ${filePath}`);
    console.log('='.repeat(60));
    
    const buffer = readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    
    const xmlFiles = ['Processes.xml', 'Steps.xml', 'Variables.xml', 'FileLocations.xml', 'Attachments.xml'];
    
    for (const fileName of xmlFiles) {
        const f = zip.file(fileName);
        if (f) {
            const content = await f.async('string');
            const parsed = parser.parse(content);
            deepParseAllXml(parsed);
            
            const stats = countNestedObjects(parsed);
            console.log(`\n${fileName}:`);
            console.log(`  - Total keys extracted: ${stats.totalKeys}`);
            console.log(`  - Max nesting depth: ${stats.maxDepth}`);
            console.log(`  - Nested XML fields parsed: ${stats.xmlParsedFields.length > 0 ? stats.xmlParsedFields.slice(0, 10).join(', ') + (stats.xmlParsedFields.length > 10 ? '...' : '') : 'none'}`);
            
            // Show sample of actual data
            if (fileName === 'Variables.xml') {
                const vars = parsed?.ArrayOfC2GenericVariable?.C2GenericVariable;
                if (vars) {
                    const varList = Array.isArray(vars) ? vars : [vars];
                    console.log(`  - Variables found: ${varList.length}`);
                    varList.slice(0, 3).forEach((v: any) => {
                        console.log(`    * ${v.Name} (${v.VariableType}) = "${String(v.DefaultValue || '').slice(0, 50)}..."`);
                    });
                }
            }
            
            if (fileName === 'FileLocations.xml') {
                const locs = parsed?.ArrayOfFileLocation?.FileLocation;
                if (locs) {
                    const locList = Array.isArray(locs) ? locs : [locs];
                    console.log(`  - File Locations found: ${locList.length}`);
                    locList.forEach((loc: any) => {
                        const serverFolder = loc.Definition?.StorageObject?.ServerFolder;
                        console.log(`    * ${loc.Name}: ${typeof serverFolder === 'object' ? serverFolder['#text'] : serverFolder}`);
                    });
                }
            }
            
            if (fileName === 'Steps.xml') {
                const steps = parsed?.ArrayOfStep?.Step;
                if (steps) {
                    const stepList = Array.isArray(steps) ? steps : [steps];
                    console.log(`  - Steps found: ${stepList.length}`);
                    
                    // Check if Definition fields are now objects (parsed) not strings
                    let parsedDefinitions = 0;
                    let stringDefinitions = 0;
                    stepList.forEach((step: any) => {
                        if (step.Definition) {
                            if (typeof step.Definition === 'object') parsedDefinitions++;
                            else stringDefinitions++;
                        }
                    });
                    console.log(`  - Definition fields parsed: ${parsedDefinitions}/${parsedDefinitions + stringDefinitions}`);
                }
            }
        } else {
            console.log(`\n${fileName}: NOT PRESENT`);
        }
    }
}

async function testDataModel(filePath: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`DATA MODEL FILE: ${filePath}`);
    console.log('='.repeat(60));
    
    const buffer = readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    
    const xmlFiles = ['DataModel.xml', 'Queries.xml', 'QueryColumns.xml', 'QueryJoins.xml', 'QueryDatasources.xml', 'Variables.xml', 'Resources.xml'];
    
    for (const fileName of xmlFiles) {
        const f = zip.file(fileName);
        if (f) {
            const content = await f.async('string');
            const parsed = parser.parse(content);
            deepParseAllXml(parsed);
            
            const stats = countNestedObjects(parsed);
            console.log(`\n${fileName}:`);
            console.log(`  - Total keys extracted: ${stats.totalKeys}`);
            console.log(`  - Max nesting depth: ${stats.maxDepth}`);
            console.log(`  - Nested XML fields parsed: ${stats.xmlParsedFields.length > 0 ? stats.xmlParsedFields.slice(0, 10).join(', ') + (stats.xmlParsedFields.length > 10 ? '...' : '') : 'none'}`);
            
            if (fileName === 'DataModel.xml') {
                const def = parsed?.DataModelDef?.Definition;
                if (def && typeof def === 'object') {
                    const dmDef = def.DataModelDefinition;
                    if (dmDef) {
                        const detailViews = dmDef.DetailViews?.DetailView;
                        const indexes = dmDef.Indexes?.Index;
                        console.log(`  - Definition parsed: YES`);
                        console.log(`  - Detail Views: ${detailViews ? (Array.isArray(detailViews) ? detailViews.length : 1) : 0}`);
                        console.log(`  - Indexes: ${indexes ? (Array.isArray(indexes) ? indexes.length : 1) : 0}`);
                    }
                }
            }
            
            if (fileName === 'QueryDatasources.xml') {
                const ds = parsed?.ArrayOfQueryDatasource?.QueryDatasource;
                if (ds) {
                    const dsList = Array.isArray(ds) ? ds : [ds];
                    console.log(`  - Datasources found: ${dsList.length}`);
                    dsList.slice(0, 3).forEach((d: any) => {
                        const params = d.ParameterValues?.Parameters?.ParameterField;
                        const tableName = params ? (Array.isArray(params) ? params.find((p: any) => p.FieldName === 'TableName')?.Value : null) : null;
                        console.log(`    * ${d.DataSourceName} -> ${tableName || d.DataSourceType}`);
                    });
                }
            }
            
            if (fileName === 'Queries.xml') {
                const queries = parsed?.ArrayOfQuery?.Query;
                if (queries) {
                    const qList = Array.isArray(queries) ? queries : [queries];
                    console.log(`  - Queries found: ${qList.length}`);
                    
                    // Check nested Criteria parsing
                    let parsedCriteria = 0;
                    qList.forEach((q: any) => {
                        if (q.Criteria && typeof q.Criteria === 'object') parsedCriteria++;
                    });
                    console.log(`  - Criteria fields parsed: ${parsedCriteria}/${qList.length}`);
                }
            }
        } else {
            console.log(`\n${fileName}: NOT PRESENT`);
        }
    }
}

async function main() {
    console.log('FULL EXTRACTION TEST - Evidence Report');
    console.log('======================================\n');
    
    // Test ETL files
    await testETL('samples/ETLs/FPR_TRANS_a794effe-99b6-467e-a68c-6f839cfc546d_20260118015428801.t1etlp');
    await testETL('samples/ETLs/COMMENTS_7bb05bc3-3868-4eab-82e1-9287e8560f6e_20260116103005590.t1etlp');
    
    // Test Data Model files
    await testDataModel('samples/Data Models/Core Financials_76583817-36f4-4256-a12a-02fbb5fce521_20260116102840208.t1dm');
    await testDataModel('samples/Data Models/AFRG_B_DM.t1dm');
    
    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60));
}

main().catch(console.error);
