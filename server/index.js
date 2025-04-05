const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcrypt'); //Import bcrypt for password hashing
const session = require('express-session');
const path = require('path'); // Import path for file paths  for locate folder/files
const multer = require('multer'); // Import multer for uplode files picture
const fs = require('fs/promises');

const app = express();
const port = 8000;
const oneDay = 24 * 60 * 60 * 1000;

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cors());

app.use(session({
    secret: 'e389f990d3261675d12eff275c158e96d0f508b30ed0943b920fb548019be73c',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: oneDay, }
}));
//การตั้งค่า Routes สำหรับการให้บริการไฟล์ HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/menu', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.get('/orders', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

app.get('/stock', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'stock.html'));
});

app.get('/staff', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'staff.html'));
});

let conn = null;

// ✅ เชื่อมต่อ MySQL ก่อนเริ่มเซิร์ฟเวอร์
const initmysql = async () => {
    try {
        conn = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root',
            database: 'coffee_shop',
            port: 8830,

        });
        console.log(' MySQL Connected');
    } catch (error) {
        console.error(' MySQL Connection Error:', error);
        process.exit(1); // ปิดโปรแกรมถ้าเชื่อมต่อไม่ได้
    }
};

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExt = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + fileExt);
    }
});

function checkAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login'); // หรือ res.status(401).send('Please log in');
    }
}

app.get('/auth-status', (req, res) => {
    const isLoggedIn = req.session.userId ? true : false;
    res.json({ isLoggedIn: isLoggedIn });
});

const upload = multer({ storage: storage });
const editUpload = multer({ storage: storage }); // Separate instance

app.post('/api/attendance', async (req, res) => {
    try {
        const { name, position, date, time } = req.body;

        // Validate the data
        if (!name || !position || !date || !time) {
            return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        const [results] = await conn.query(
            'INSERT INTO attendance (name, position, date, time) VALUES (?, ?, ?, ?)',
            [name, position, date, time]
        );

        res.json({ message: 'บันทึกข้อมูลสำเร็จ' });
    } catch (error) {
        console.error('❌ Error adding attendance:', error);
        res.status(500).json({ message: 'ไม่สามารถบันทึกข้อมูลได้' });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, email, password, passwordconfirm } = req.body;

    try {
        // ตรวจสอบรหัสผ่าน
        if (password !== passwordconfirm) {
            return res.status(400).send('รหัสผ่านไม่ตรงกัน');
        }

        // ตรวจสอบอีเมลซ้ำ
        const [emailExists] = await conn.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (emailExists.length > 0) {
            return res.status(400).send('อีเมลนี้ถูกใช้แล้ว');
        }

        // เข้ารหัสรหัสผ่าน
        const hashedPassword = await bcrypt.hash(password, 10);

        // เพิ่มผู้ใช้ใหม่
        await conn.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

        res.send('สมัครสมาชิกสำเร็จ');

    } catch (err) {
        console.error('Error registering user:', err);
        res.status(500).send('เกิดข้อผิดพลาดในการสมัครสมาชิก');
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [results] = await conn.query(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (results.length > 0) {
            const user = results[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (passwordMatch) {
                req.session.username = user.username;
                req.session.email = user.email;
                req.session.userId = user.id;
                await new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
                res.send('เข้าสู่ระบบสำเร็จ');
            } else {
                res.status(401).send('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        } else {
            res.status(401).send('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }

    } catch (err) {
        console.error('Error logging in:', err);
        res.status(500).send('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
});

// ✅ ดึงข้อมูลการเข้า-ออกงาน
app.get('/api/attendance', async (req, res) => {
    try {
        const [results] = await conn.query('SELECT name, position, date, time, leave_time FROM attendance');
        res.json(results);
    } catch (error) {
        console.error('❌ Error fetching attendance:', error);
        res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลได้' });
    }
});

app.get('/api/menu', async (req, res) => {
    try {
        const [results] = await conn.query('SELECT * FROM menu');
        res.json(results);
    } catch (error) {
        console.error('❌ Error fetching menu:', error);
        res.status(500).json({ message: 'Something went wrong' });
    }
});

app.delete('/api/attendance/:name', async (req, res) => {
    try {
        const name = req.params.name;

        // Check if the employee exists
        const [checkResult] = await conn.query('SELECT * FROM attendance WHERE name = ?', [name]);
        if (checkResult.length === 0) {
            return res.status(404).json({ message: 'ไม่พบพนักงานชื่อนี้' });
        }

        // Delete the employee from attendance
        const [results] = await conn.query('DELETE FROM attendance WHERE name = ?', [name]);
        res.json({ message: 'ลบข้อมูลสำเร็จ' });
    } catch (error) {
        console.error('❌ Error deleting attendance:', error);
        res.status(500).json({ message: 'ไม่สามารถลบข้อมูลได้' });
    }
});

app.post('/api/attendance-signout', async (req, res) => {
    try {
        const { name } = req.body; // รับ name จาก request body

        // Check if the employee exists
        const [checkResult] = await conn.query('SELECT * FROM attendance WHERE name = ? AND leave_time IS NULL', [name]);
        if (checkResult.length === 0) {
            return res.status(404).json({ message: 'ไม่พบพนักงาน หรือพนักงานได้ลงเวลาออกงานไปแล้ว' });
        }

        const now = new Date();
        const formattedTime = now.toLocaleTimeString('en-GB'); // Get current time in HH:MM:SS format
        const [results] = await conn.query(
            'UPDATE attendance SET leave_time = ? WHERE name = ? AND leave_time IS NULL',
            [formattedTime, name]
        );

        res.json({ message: 'บันทึกเวลาออกงานสำเร็จ' });
    } catch (error) {
        console.error('❌ Error signing out:', error);
        res.status(500).json({ message: 'ไม่สามารถบันทึกเวลาออกงานได้' });
    }
});

app.get('/api/menu-edit/:name', async (req, res) => {
    try {
        const name = req.params.name;

        const [results] = await conn.query('SELECT * FROM menu WHERE menu_name = ?', [name]);
        if (results.length === 0) {
            return res.status(404).json({ message: 'ไม่พบเมนูนี้' });
        }
        res.json(results);
    } catch (error) {
        console.error('❌ Error fetching menu:', error);
        res.status(500).json({ message: 'Something went wrong' });
    }
});

app.post('/api/menu', upload.single('menuImage'), async (req, res) => {
    try {
        const { name, price, quantity } = req.body;

        // Validation (add more as needed)
        if (!name || !price || !quantity) {
            return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        let imagePath = '';
        if (req.file) {
            imagePath = '/uploads/' + req.file.filename; // Save the image path
        }

        const [results] = await conn.query(
            'INSERT INTO menu (menu_name, price, quantity, image_path) VALUES (?, ?, ?, ?)',
            [name, price, quantity, imagePath]
        );

        res.json({ name, price, quantity, image_path: imagePath }); // Send back the added menu item
    } catch (error) {
        console.error('❌ Error adding menu:', error);
        res.status(500).json({ message: 'ไม่สามารถเพิ่มเมนูได้' });
    }
});

app.delete('/api/menu/:name', async (req, res) => {
    try {
        const name = req.params.name;

        const [checkResult] = await conn.query('SELECT image_path FROM menu WHERE menu_name = ?', [name]);
        if (checkResult.length === 0) {
            return res.status(404).json({ message: 'ไม่พบเมนูนี้' });
        }

        const imagePath = checkResult[0].image_path;

        await conn.query('DELETE FROM menu WHERE menu_name = ?', [name]);

        if (imagePath) {
            try {
                await fs.unlink(path.join(__dirname, 'public', imagePath)); // Delete the image
            } catch (err) {
                console.error(`Error deleting image: ${err}`);
            }
        }

        res.json({ message: 'ลบเมนูสำเร็จ' });

    } catch (error) {
        console.error('❌ Error deleting menu:', error);
        res.status(500).json({ message: 'ไม่สามารถลบเมนูได้' });
    }
});

app.put('/api/menu/:name', editUpload.single('editMenuImage'), async (req, res) => {
    try {
        const name = req.params.name;
        const { price, quantity, newName } = req.body;

        if (!price || !quantity || !newName) {
            return res.status(400).json({ message: 'กรุณากรอก ราคา, จำนวน, และ ชื่อเมนู' });
        }

        const [checkResult] = await conn.query('SELECT image_path FROM menu WHERE menu_name = ?', [name]);
        if (checkResult.length === 0) {
            return res.status(404).json({ message: 'ไม่พบเมนูนี้' });
        }

        const oldImagePath = checkResult[0].image_path; // Get the old image path

        let imagePath = null;
        if (req.file) {
            imagePath = '/uploads/' + req.file.filename;
        }

        let updateQuery = 'UPDATE menu SET menu_name = ?, price = ?, quantity = ?';
        let updateParams = [newName, price, quantity];

        if (imagePath) {
            updateQuery += ', image_path = ?';
            updateParams.push(imagePath);
        }

        updateQuery += ' WHERE menu_name = ?';
        updateParams.push(name);

        const [results] = await conn.query(updateQuery, updateParams);

        if (req.file && oldImagePath) {
            try {
                await fs.unlink(path.join(__dirname, 'public', oldImagePath));
            } catch (err) {
                console.error(`Error deleting old image: ${err}`);
            }
        }

        res.json({ message: 'แก้ไขเมนูสำเร็จ', name: newName, price, quantity, image_path: imagePath });

    } catch (error) {
        console.error('❌ Error updating menu:', error);
        res.status(500).json({ message: 'ไม่สามารถแก้ไขเมนูได้' });
    }
});

// ✅ ดึงข้อมูลการสั่งซื้อจากฐานข้อมูล
app.get('/api/orders', async (req, res) => {
    try {
        const [results] = await conn.query(`
            SELECT
                o.order_id,
                o.customer_name,
                o.total_price,
                o.order_date,
                GROUP_CONCAT(oi.menu_name, ' (', oi.quantity, ')') AS items
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            GROUP BY o.order_id
        `);

        res.json(results);
    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลการสั่งซื้อได้' });
    }
});

app.put('/api/menu/:name', async (req, res) => {
    try {
        const name = req.params.name;
        const { price, quantity } = req.body;

        // Validate the data
        if (!price || !quantity) {
            return res.status(400).json({ message: 'กรุณากรอก ราคา และ จำนวน' });
        }

        // Check if the menu item exists
        const [checkResult] = await conn.query('SELECT * FROM menu WHERE menu_name = ?', [name]);
        if (checkResult.length === 0) {
            return res.status(404).json({ message: 'ไม่พบเมนูนี้' });
        }

        // Update the menu item
        const [results] = await conn.query(
            'UPDATE menu SET price = ?, quantity = ? WHERE menu_name = ?',
            [price, quantity, name]
        );

        res.json({ message: 'แก้ไขเมนูสำเร็จ', name, price, quantity });
    } catch (error) {
        console.error('❌ Error updating menu:', error);
        res.status(500).json({ message: 'ไม่สามารถแก้ไขเมนูได้' });
    }
});

// ✅ ดึงข้อมูลการสั่งซื้อตาม ID (ละเอียดขึ้น)
app.get('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const [orderResults] = await conn.query(
            `
            SELECT
                o.order_id,
                o.customer_name,
                o.total_price,
                o.order_date
            FROM orders o
            WHERE o.order_id = ?
            `,
            [orderId] // ส่ง orderId เป็น parameter
        );

        if (orderResults.length === 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลการสั่งซื้อ' });
        }

        const [itemResults] = await conn.query(
            `
            SELECT
                oi.menu_name,
                oi.quantity,
                oi.price
            FROM order_items oi
            WHERE oi.order_id = ?
            `,
            [orderId] // ส่ง orderId เป็น parameter
        );

        res.json({ ...orderResults[0], items: itemResults });
    } catch (error) {
        console.error('❌ Error fetching order by ID:', error);
        res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลการสั่งซื้อได้' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            res.status(500).send('เกิดข้อผิดพลาดในการออกจากระบบ');
        } else {
            res.redirect('/login'); // หรือ res.redirect('/'); ตามความเหมาะสม
        }
    });
});

// ✅ บันทึกข้อมูลการสั่งซื้อ
app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        // ตรวจสอบข้อมูล order ก่อนบันทึก
        if (!order.customerName || !order.items || order.items.length === 0) {
            return res.status(400).json({ message: 'ข้อมูลการสั่งซื้อไม่ถูกต้อง' });
        }

        // เริ่ม Transaction
        await conn.beginTransaction();

        // 1. บันทึกข้อมูลลูกค้าและการสั่งซื้อหลัก
        const [orderResult] = await conn.execute(
            'INSERT INTO orders (customer_name, total_price) VALUES (?, ?)',
            [order.customerName, order.totalPrice]
        );
        const orderId = orderResult.insertId;

        // 2. บันทึกรายการสินค้าที่สั่ง
        for (const item of order.items) {
            await conn.execute(
                'INSERT INTO order_items (order_id, menu_name, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.name, item.quantity, item.price]
            );

            // 3. ลดจำนวนสินค้าคงเหลือใน menu table
            await conn.execute(
                'UPDATE menu SET quantity = quantity - ? WHERE menu_name = ?',
                [item.quantity, item.name]
            );
        }

        // Commit transaction
        await conn.commit();

        res.json({ message: 'Order saved successfully', orderId: orderId });
    } catch (error) {
        // Rollback transaction ในกรณีเกิด error
        if (conn) await conn.rollback();
        console.error('❌ Error saving order:', error);
        res.status(500).json({ message: 'ไม่สามารถบันทึกข้อมูลการสั่งซื้อได้' });
    }
});

// ✅ แก้ไขข้อมูลการสั่งซื้อ (ซับซ้อนขึ้น)
app.put('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;
        const updatedOrder = req.body;
        // Validate updated data (add more validation as needed)
        if (!updatedOrder.customer_name || !updatedOrder.items || updatedOrder.items.length === 0) {
            return res.status(400).json({ message: 'ข้อมูลการสั่งซื้อไม่ถูกต้อง' });
        }

        // Begin Transaction
        await conn.beginTransaction();

        // 1. Update main order details
        const updateOrderQuery = 'UPDATE orders SET customer_name = ?, total_price = ? WHERE order_id = ?';
        const updateOrderParams = [updatedOrder.customer_name, updatedOrder.total_price, orderId];
        await conn.execute(updateOrderQuery, updateOrderParams);

        // 2. Delete existing items
        const deleteItemsQuery = 'DELETE FROM order_items WHERE order_id = ?';
        const deleteItemsParams = [orderId];
        await conn.execute(deleteItemsQuery, deleteItemsParams);

        // 3. Insert updated items
        for (let i = 0; i < updatedOrder.items.length; i++) {
            const item = updatedOrder.items[i];
            const menu_name = item.menu_name !== undefined ? item.menu_name : null;
            const quantity = item.quantity !== undefined ? item.quantity : null;
            const price = item.price !== undefined ? item.price : null;

            const insertItemQuery = 'INSERT INTO order_items (order_id, menu_name, quantity, price) VALUES (?, ?, ?, ?)';
            const insertItemParams = [orderId, menu_name, quantity, price];
            await conn.execute(insertItemQuery, insertItemParams);
        }

        // Commit Transaction
        await conn.commit();

        res.json({ message: 'Order updated successfully' });
    } catch (error) {
        // Rollback Transaction
        if (conn) await conn.rollback();
        console.error('❌ Error updating order:', error);
        res.status(500).json({ message: 'ไม่สามารถแก้ไขข้อมูลการสั่งซื้อได้' });
    }
});

// ✅ ลบข้อมูลการสั่งซื้อ (เหมือนเดิม)
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const orderId = req.params.id;

        // เริ่ม Transaction เพื่อให้แน่ใจว่าการลบข้อมูลทั้งหมดสำเร็จ
        await conn.beginTransaction();

        // 1. ลบรายการสินค้าที่เกี่ยวข้องกับคำสั่งซื้อ
        await conn.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);

        // 2. ลบคำสั่งซื้อหลัก
        await conn.execute('DELETE FROM orders WHERE order_id = ?', [orderId]);

        // Commit transaction
        await conn.commit();

        res.json({ message: 'Order deleted successfully' });
    } catch (error) {
        // Rollback transaction ในกรณีเกิด error
        if (conn) await conn.rollback();
        console.error('❌ Error deleting order:', error);
        res.status(500).json({ message: 'ไม่สามารถลบข้อมูลการสั่งซื้อได้' });
    }
});

// ✅ เริ่มต้นเซิร์ฟเวอร์หลังจากเชื่อมต่อ MySQL สำเร็จ
initmysql().then(() => {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
});