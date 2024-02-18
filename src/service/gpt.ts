import * as fs from 'fs';
import 'dotenv/config';
import { Cookie } from '../main';

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
const User_Agent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.142.86 Safari/537.36';

export class Gpt {
    public async getUserInformationByCookie(
        cookie: Cookie,
        retry = 5,
    ): Promise<{
        userData: UserData;
        success: boolean;
    }> {
        try {
            const response = await fetch('https://chat.openai.com/api/auth/session', {
                headers: {
                    accept: '*/*',
                    'accept-language': 'vi,en-US;q=0.9,en;q=0.8',
                    'if-none-match': 'W/"ry8kirf8zj1du"',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "YaBrowser";v="24.1", "Yowser";v="2.5"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    Referer: 'https://chat.openai.com/',
                    cookie: cookie.cookie,
                    'User-Agent': User_Agent,
                },
                method: 'GET',
            });
            if (response.ok) {
                const data = await response.json();
                if (data['error']) {
                    throw new Error(data['error']);
                }
                data.user.account_id = this.getAccountIdByCookie(cookie.cookie);
                return {
                    userData: data,
                    success: true,
                };
            } else {
                console.log(response.status);
                throw new Error(`Không thể lấy được thể với cookie ${cookie.email}`);
            }
        } catch (error) {
            if (retry <= 0) {
                writeFileLog(`${cookie.email} có thể đã bị die`);
                return {
                    userData: null,
                    success: false,
                };
            }
            console.error('Lỗi: ' + error.message);
            return this.getUserInformationByCookie(cookie, retry - 1);
        }
    }

    public getAccountIdByCookie(cookie: string): string {
        const accountRegex = /_account=([^;]+)/;
        const match = cookie.match(accountRegex);
        if (match) {
            return match[1];
        }
        throw new Error('Cookie không hợp lệ');
    }

    public async getListUserFromWorkSpace(userData: UserData): Promise<UserWorkSpace[]> {
        const url = `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/users?offset=0&limit=25&query=`;
        try {
            const response = await fetch(url, {
                headers: {
                    accept: '*/*',
                    'User-Agent': User_Agent,
                    Referer: 'https://chat.openai.com/',
                    Authorization: `Bearer ${userData.accessToken}`,
                },
                method: 'GET',
            });

            if (response.ok) {
                const data = await response.json();
                return data['items'];
            } else {
                throw new Error(`Lỗi khi lấy thông tin người dùng ${userData.user.email}`);
            }
        } catch (error) {
            console.error('Lỗi: ' + error.message);
            return undefined;
        }
    }

    public async getListUserPendingFromWorkSpace(userData: UserData): Promise<UserWorkSpace[]> {
        const url = `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/invites?offset=0&limit=25&query=`;
        try {
            const response = await fetch(url, {
                headers: {
                    accept: '*/*',
                    'User-Agent': User_Agent,
                    Referer: 'https://chat.openai.com/',
                    Authorization: `Bearer ${userData.accessToken}`,
                },
                method: 'GET',
            });

            if (response.ok) {
                const data = await response.json();

                return data['items'];
            } else {
                // Tạo một lỗi tùy chỉnh mà không bao gồm chi tiết về stack trace
                throw new Error('Không thể lấy được danh sách người dùng đang chờ ' + userData.user.email);
            }
        } catch (error) {
            console.error('Lỗi: ' + error.message);
            return undefined;
        }
    }

    public async deleteUserFromWorkSpaceInvite(userData: UserData, userWorkSpace: UserWorkSpace): Promise<void> {
        try {
            const response = await fetch(
                `https://chat.openai.com/backend-api/accounts/${userData.user.account_id}/invites`,
                {
                    headers: {
                        accept: '*/*',
                        'User-Agent': User_Agent,
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
                writeFileLog(
                    `${userData.user.email} | DELETE PENDING: ${JSON.stringify(userWorkSpace)} | ${userData.user.email} `,
                );
                throw new Error(`Tài khoản ${userWorkSpace.email_address} có lỗi, vui là kiểm tra lại`);
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
                        'User-Agent': User_Agent,
                        Authorization: `Bearer ${userData.accessToken}`,
                        'content-type': 'application/json',
                        Referer: 'https://chat.openai.com/',
                    },

                    method: 'DELETE',
                },
            );
            const data = await response.json();
            if (!response.ok) {
                writeFileLog(
                    `${userData.user.email} | DELETE USER: ${JSON.stringify(userWorkSpace)} | ${userData.user.email} | ${JSON.stringify(data)}`,
                );
                throw new Error(`Tài khoản ${userWorkSpace.email} có lỗi, vui là kiểm tra lại`);
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
                        'User-Agent': User_Agent,
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
