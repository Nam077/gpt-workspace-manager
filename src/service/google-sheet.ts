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

    private async initServiceAccountAuth(retry = 10) {
        try {
            this.serviceAccountAuth = new JWT({
                email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                key: process.env.GOOGLE_PRIVATE_KEY,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
        } catch (error) {
            if (retry <= 0) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
            console.log(`Retry to init service account auth: ${retry}`);
            await this.initServiceAccountAuth(retry - 1);
        }

    }

    private doc: GoogleSpreadsheet;

    private async initDoc(id: string, retry = 10) {
        try {
            this.doc = new GoogleSpreadsheet(id, this.serviceAccountAuth);
            await this.doc.loadInfo();
        } catch (error) {

            if (retry <= 0) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
            console.log(`Retry to init doc: ${retry}`);
            await this.initDoc(id, retry - 1);
        }
    }

    private async getRows(retry = 10) {
        try {
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
        } catch (error) {

            if (retry <= 0) {
                return undefined;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
            console.log(`Retry to get rows: ${retry}`);
            return await this.getRows(retry - 1);
        }
    }
    public async groupByOwner(): Promise<Record<string, User[]>> {
        const users = await this.getRows();
        if (!users) return undefined;
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
        try {
            await this.initServiceAccountAuth();
            await this.initDoc(process.env.GOOGLE_SHEET_ID);
        }
        catch (error) {
            console.log(error);
        }
    }
}
