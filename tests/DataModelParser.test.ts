
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DataModelParser } from '../src/lib/parsers/DataModelParser';

describe('DataModelParser', () => {
    it('should unzip and deep parse XML content', async () => {
        // 1. Create a logical mock ZIP
        const zip = new JSZip();
        
        // Main file
        const mainXml = `<DataModelDef><Name>Test Model</Name></DataModelDef>`;
        zip.file('DataModel.xml', mainXml);

        // Nested XML inside a string field (Deep parse target)
        // Definition field containing XML
        const definitionXml = `<Inner><Field>Value</Field></Inner>`;
        // Encoded or just stringified? fast-xml-parser handles text. 
        // The parser parses string values.
        const queriesXml = `<QueryList><Query><Definition>${definitionXml}</Definition></Query></QueryList>`;
        zip.file('Queries.xml', queriesXml);

        // Generate Blob
        const blob = await zip.generateAsync({ type: 'blob' });
        const file = new File([blob], 'test.t1dm');

        // 2. Parse
        const result = await DataModelParser.parse(file);

        // 3. Assert
        expect(result).toBeDefined();
        
        // Assert Main File
        expect(result.DataModel).toBeDefined();
        expect(result.DataModel.DataModelDef.Name).toBe('Test Model');

        // Assert Deep Parse (Definition should be an object, not string)
        expect(result.Queries).toBeDefined();
        const query = result.Queries.QueryList.Query;
        expect(typeof query.Definition).toBe('object');
        // Check inner values
        expect(query.Definition.Inner.Field).toBe('Value');
    });

    it('should ignore missing files gracefully', async () => {
        const zip = new JSZip();
        zip.file('Random.txt', 'nothing');
        const blob = await zip.generateAsync({ type: 'blob' });
        const file = new File([blob], 'empty.t1dm');

        const result = await DataModelParser.parse(file);
        expect(result).toEqual({});
    });
});
