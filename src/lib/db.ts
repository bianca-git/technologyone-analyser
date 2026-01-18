import Dexie, { type Table } from 'dexie';

export interface Report {
    id?: number;
    filename: string;
    metadata: {
        name: string;
        id: string;
        version: string;
        owner: string;
        description: string;
        status?: string;
        narration?: string;
        dateModified?: string;
    };
    rawProcess: any;
    rawSteps: any;
    dateAdded: Date;
    stepNotes?: Record<string, string>; // Map of stepId -> note text
}

export interface DataModel {
    id?: number;
    filename: string;
    metadata: {
        name: string;
        id?: string;
        description: string;
        version?: string;
        owner?: string;
        dateModified?: string;
    };
    content: any; // Holds the parsed DataModel, Queries, etc.
    dateAdded: Date;
    stepNotes?: Record<string, string>; // Map of QueryName/Id -> note text
}

export class T1GuruDB extends Dexie {
    reports!: Table<Report>;
    dataModels!: Table<DataModel>;

    constructor() {
        super('T1GuruDB');
        this.version(1).stores({
            reports: '++id, filename, dateAdded' // Primary key and indexed props
        });
        // Version 2: Add dataModels
        this.version(2).stores({
            dataModels: '++id, filename, dateAdded'
        });
    }
}

export const db = new T1GuruDB();
