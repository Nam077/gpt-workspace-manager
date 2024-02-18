import * as fs from 'fs';
import * as csv from 'fast-csv';

export async function updateCsvFile(filePath: string, emailToFind: string, key: string, newValue: string): Promise<void> {
    const rows: any[] = [];
    const stream = fs.createReadStream(filePath);
    
    await new Promise((resolve, reject) => {
        stream.pipe(csv.parse({ headers: true }))
            .on('error', error => reject(error))
            .on('data', row => {
                if (row.email === emailToFind) {
                    row[key] = newValue; 
                }
                rows.push(row);
            })
            .on('end', resolve);
    });
    await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        csv.write(rows, { headers: true }).pipe(writeStream);
    });
}

export async function readFile<T>(filePath: string): Promise<T[]> {
    const rows: T[] = [];
    const stream = fs.createReadStream(filePath);

    await new Promise<void>((resolve, reject) => {
        stream.pipe(csv.parse({ headers: true }))
            .on('error', error => reject(error))
            .on('data', row => {
                rows.push(row); 
            })
            .on('end', resolve);
    });

    return rows as T[];
}
export async function deleteRows(filePath: string, condition: (row: any) => boolean): Promise<void> {
    const rows: any[] = [];
    const stream = fs.createReadStream(filePath);

    await new Promise<void>((resolve, reject) => {
        stream.pipe(csv.parse({ headers: true }))
            .on('error', error => reject(error))
            .on('data', row => {
                if (!condition(row)) {
                    rows.push(row); 
                }
            })
            .on('end', resolve);
    });

    await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        csv.write(rows, { headers: true }).pipe(writeStream);
    });
}

