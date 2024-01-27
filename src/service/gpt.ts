import * as fs from 'fs';
import 'dotenv/config';

const logFile = 'log.txt';
if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '');
}
const writeFileLog = (message: string) => {
    fs.appendFileSync(logFile, message + '\n');
};
export interface UserData {
    user: {
        id: string;
        name: string;
        email: string;
        image: string;
        picture: string;
        idp: string;
        iat: number;
        mfa: boolean;
        groups: string[];
        intercom_hash: string;
        account_id?: string;
    };
    expires: string;
    accessToken: string;
    authProvider: string;
}

export interface UserWorkSpace {
    id: string;
    email_address: string;
    role: string;
    name: string;
    created_time: string;
    email?: string;
}

export const chunk = <T>(array: T[], size: number): T[][] => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
};

export class Gpt {
    public async getUserInformationByCookie(cookie: string): Promise<UserData> {
        try {
            const response = await fetch('https://chat.openai.com/api/auth/session', {
                headers: {
                    accept: '*/*',
                    Referer: 'https://chat.openai.com/',
                    cookie,
                },
                method: 'GET',
            });

            if (response.ok) {
                const data = await response.json();
                data.user.account_id = this.getAccountIdByCookie(cookie);
                return data;
            } else {
                throw new Error('Không thể truy cập dữ liệu');
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    public getAccountIdByCookie(cookie: string): string {
        const accountRegex = /_account=([^;]+)/;
        const match = cookie.match(accountRegex);
        if (match) {
            return match[1];
        }
        throw new Error('Không thể truy cập dữ liệu');
    }

    public async getListUserFromWorkSpace(userData: UserData): Promise<UserWorkSpace[]> {
        console.log(userData.user.account_id);
        const url = `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/users?offset=0&limit=25&query=`;
        const response = await fetch(url, {
            headers: {
                accept: '*/*',
                Referer: 'https://chat.openai.com/',
                Authorization: `Bearer ${userData.accessToken}`,
            },
            method: 'GET',
        });

        if (response.ok) {
            const data = await response.json();
            return data['items'];
        } else {
            throw new Error('Không thể truy cập dữ liệu');
        }
    }

    public async getListUserPendingFromWorkSpace(userData: UserData): Promise<UserWorkSpace[]> {
        const url = `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/invites?offset=0&limit=25&query=`;
        const response = await fetch(url, {
            headers: {
                accept: '*/*',
                Referer: 'https://chat.openai.com/',
                Authorization: `Bearer ${userData.accessToken}`,
            },
            method: 'GET',
        });

        if (response.ok) {
            const data = await response.json();
            return data['items'];
        } else {
            throw new Error('Không thể truy cập dữ liệu');
        }
    }

    public async deleteUserFromWorkSpaceInvite(userData: UserData, userWorkSpace: UserWorkSpace): Promise<void> {
        try {
            const response = await fetch(
                `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/invites`,
                {
                    headers: {
                        accept: '*/*',
                        Authorization: `Bearer ${userData.accessToken}`,
                        'content-type': 'application/json',
                        Referer: 'https://chat.openai.com/',
                    },

                    body: JSON.stringify({ email_address: userWorkSpace.email_address }),
                    method: 'DELETE',
                },
            );
            const data = await response.json();
            if (!response.ok) {
                console.error(data);
                throw new Error('Không thể truy cập dữ liệu');
            }
            console.log(`Xóa user ${userWorkSpace.email_address} thành công`);
            writeFileLog(
                `${userData.user.email} | DELETE PENDING: ${JSON.stringify(userWorkSpace)} | ${userData.user.email} `,
            );
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    public async deleteUserFromWorkSpaceUser(userData: UserData, userWorkSpace: UserWorkSpace) {
        try {
            const response = await fetch(
                `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/users/${userWorkSpace.id}`,
                {
                    headers: {
                        accept: '*/*',
                        Authorization: `Bearer ${userData.accessToken}`,
                        'content-type': 'application/json',
                        Referer: 'https://chat.openai.com/',
                    },

                    method: 'DELETE',
                },
            );
            const data = await response.json();
            if (!response.ok) {
                console.error(data);
                throw new Error('Không thể truy cập dữ liệu');
            }
            console.log(`Xóa user ${userWorkSpace.email} thành công`);
            writeFileLog(
                `${userData.user.email} | DELETE USER: ${JSON.stringify(userWorkSpace)} | ${userData.user.email} | ${JSON.stringify(data)}`,
            );
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    public async deleteMultiUserFromWorkSpaceUser(userData: UserData, userWorkSpaces: UserWorkSpace[]): Promise<void> {
        const tasks = userWorkSpaces.map((userWorkSpace) => {
            return this.deleteUserFromWorkSpaceUser(userData, userWorkSpace);
        });
        const chunks = chunk(tasks, 10);
        for (const chunk of chunks) {
            await Promise.all(chunk);
        }
        return;
    }

    public async deleteMultiUserFromWorkSpaceInvite(
        userData: UserData,
        userWorkSpaces: UserWorkSpace[],
    ): Promise<void> {
        const tasks = userWorkSpaces.map((userWorkSpace) => {
            return this.deleteUserFromWorkSpaceInvite(userData, userWorkSpace);
        });
        const chunks = chunk(tasks, 10);
        for (const chunk of chunks) {
            await Promise.all(chunk);
        }
        return;
    }

    public async inviteUserToWorkSpace(userData: UserData, emails: string[]): Promise<void> {
        try {
            const response = await fetch(
                `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/invites`,
                {
                    headers: {
                        accept: '*/*',
                        Authorization: `Bearer ${userData.accessToken}`,
                        'content-type': 'application/json',
                        Referer: 'https://chat.openai.com/',
                    },
                    method: 'POST',
                    body: JSON.stringify({ email_addresses: emails, resend_emails: false, role: 'standard-user' }),
                },
            );
            const data = await response.json();
            console.log(`Thêm email: ${emails.join(',')}`);
            writeFileLog(`${userData.user.email} | ADD: ${emails.join(', ')} | ${userData.user.email} `);

            if (!response.ok) {
                console.error(data);
                throw new Error('Không thể truy cập dữ liệu');
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
}
