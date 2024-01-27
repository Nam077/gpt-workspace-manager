import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import 'dotenv/config';
import * as fs from 'fs';
export interface User {
    email: string;
    name: string;
    owner: string;
}

export class GoogleSheet {
    private serviceAccountAuth: JWT;

    private async initServiceAccountAuth() {
        this.serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    }

    private doc: GoogleSpreadsheet;

    private async initDoc(id: string) {
        this.doc = new GoogleSpreadsheet(id, this.serviceAccountAuth);
        await this.doc.loadInfo();
    }

    private async getRows() {
        const users: User[] = [];
        const sheet = this.doc.sheetsByTitle[process.env.GOOGLE_SHEET_TITLE];
        const rows = await sheet.getRows();
        for (const row of rows) {
            if (!row.get('Owned')) continue;
            users.push({
                name: row.get('KHÁCH HÀNG'),
                email: row.get('MAIL MEMBER'),
                owner: row.get('Owned'),
            });
        }
        return users;
    }
    public async groupByOwner(): Promise<Record<string, User[]>> {
        const users = await this.getRows();
        return users.reduce(
            (acc, user) => {
                // Initialize the owner array if not already present
                if (!acc[user.owner]) {
                    acc[user.owner] = [];
                }
                // Push the user into the respective owner's array
                acc[user.owner].push(user);
                return acc;
            },
            {} as Record<string, User[]>,
        );
    }

    public async init() {
        await this.initServiceAccountAuth();
        await this.initDoc(process.env.GOOGLE_SHEET_ID);
    }
}
