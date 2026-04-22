// --- ALMACENAMIENTO DE DATOS (DATA STORE) ---
// Este objeto centraliza todo el acceso a localStorage para persistir los datos.
const db = {
    // Obtiene la lista de usuarios. Si no hay nada, devuelve un array vacío.
    getUsers: () => {
        try {
            const data = localStorage.getItem('users');
            if (!data) return [];
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    },
    // Guarda la lista completa de usuarios en el almacenamiento local.
    saveUsers: (users) => {
        if (!Array.isArray(users)) return;
        localStorage.setItem('users', JSON.stringify(users));
    },
    
    // Obtiene todos los registros de fichajes guardados.
    getLogs: () => {
        try {
            const data = localStorage.getItem('logs');
            if (!data) return [];
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    },
    // Guarda todos los fichajes en el almacenamiento local.
    saveLogs: (logs) => {
        if (!Array.isArray(logs)) return;
        localStorage.setItem('logs', JSON.stringify(logs));
    },
    
    // USAMOS localStorage: Para que los datos no se borren al cerrar el navegador.
    // Obtiene el usuario que ha iniciado sesión actualmente.
    getCurrentUser: () => {
        try { return JSON.parse(localStorage.getItem('currentUser')); } 
        catch(e) { return null; }
    },
    // Guarda el usuario actual en localStorage tras un login exitoso.
    setCurrentUser: (user) => localStorage.setItem('currentUser', JSON.stringify(user)),
    // Borra el rastro del usuario actual del localStorage (logout).
    clearCurrentUser: () => localStorage.removeItem('currentUser'),

    // Inicialización de la base de datos: crea el administrador por defecto si no existe.
    init: () => {
        let users = db.getUsers();
        let adminUser = users.find(u => u.username === 'admin');
        
        // Si el administrador no existe, lo creamos con la nueva contraseña
        if (!adminUser) {
            users.push({ 
                id: 1, 
                username: 'admin', 
                password: 'ecostruct23', // NUEVA CONTRASEÑA
                name: 'Administrador', 
                role: 'admin' 
            });
            db.saveUsers(users);
        } else {
            // Si ya existe, nos aseguramos de que la contraseña se actualice a la nueva
            if (adminUser.password !== 'ecostruct23') {
                adminUser.password = 'ecostruct23';
                db.saveUsers(users);
            }
        }
    }
};

// --- LÓGICA DE LA APLICACIÓN (APP) ---
const app = {
    // Arranca la aplicación, inicializa DB, carga reloj y comprueba sesión previa.
    init: () => {
        db.init();
        const user = db.getCurrentUser();
        // Si hay un usuario guardado en localStorage, entramos directamente.
        if (user) {
            app.loadDashboard(user);
        } else {
            // Si no hay usuario, nos aseguramos de que se vea el login.
            document.getElementById('login-screen').classList.remove('hidden');
        }
        
        // Configura los filtros de fecha por defecto para el panel de administración.
        const now = new Date();
        document.getElementById('filter-date').valueAsDate = now;
        const monthStr = now.toISOString().slice(0, 7);
        document.getElementById('filter-month').value = monthStr;
        
        // Inicia el segundero del reloj en pantalla.
        setInterval(ui.updateClock, 1000);
    },

    // Gestiona el proceso de validación de usuario y contraseña.
    login: () => {
        const uInput = document.getElementById('login-user');
        const pInput = document.getElementById('login-pass');
        const errorEl = document.getElementById('login-error');

        if(!uInput || !pInput) return;

        const u = uInput.value.trim().toLowerCase();
        const p = pInput.value.trim();
        
        const users = db.getUsers();
        const user = users.find(user => user.username === u && user.password === p);

        if (user) {
            db.setCurrentUser(user);
            // Tras un login manual exitoso, cargamos el panel.
            app.loadDashboard(user);
        } else {
            errorEl.style.display = 'block';
            errorEl.textContent = "Usuario o contraseña incorrectos";
        }
    },

    // Cierra la sesión y recarga la página para limpiar estados.
    logout: () => {
        db.clearCurrentUser();
        location.reload();
    },

    // Decide qué vista mostrar (admin o trabajador) según el rol del usuario.
    loadDashboard: (user) => {
        // CORRECCIÓN: Siempre ocultamos la pantalla de login al cargar cualquier dashboard.
        document.getElementById('login-screen').classList.add('hidden');
        
        // Mostramos la cabecera común.
        document.getElementById('main-header').classList.remove('hidden');
        document.getElementById('current-user-name').textContent = user.name;

        if (user.role === 'admin') {
            document.getElementById('menu-trigger').classList.remove('hidden');
            document.getElementById('admin-panel').classList.remove('hidden');
            admin.init();
        } else {
            document.getElementById('worker-view').classList.remove('hidden');
            worker.init(user);
        }
    }
};

// --- LÓGICA DEL TRABAJADOR (WORKER) ---
const worker = {
    currentUser: null,
    isClockedIn: false, // Indica si el trabajador está trabajando actualmente.

    // Inicializa la vista del trabajador.
    init: (user) => {
        worker.currentUser = user;
        worker.checkStatus(); // Verifica el último fichaje para saber el estado.
        ui.updateClock();
    },

    // Revisa los fichajes del usuario hoy para determinar si debe entrar o salir.
    checkStatus: () => {
        const logs = db.getLogs().filter(l => l.userId === worker.currentUser.id);
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (logs.length > 0) {
            const last = logs[0];
            const isToday = new Date(last.timestamp).toDateString() === new Date().toDateString();
            // Si el último fichaje hoy fue una "Entrada (IN)", entonces está "Fichado".
            worker.isClockedIn = (isToday && last.type === 'IN');
        } else {
            worker.isClockedIn = false;
        }
        worker.updateUI();
    },

    // Lógica al pulsar el botón grande de Fichaje.
    clockAction: () => {
        if (!confirm(worker.isClockedIn ? "¿Confirmar fichaje de SALIDA?" : "¿Confirmar fichaje de ENTRADA?")) return;

        // Intenta obtener la ubicación GPS antes de registrar el fichaje.
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => { worker.registerLog(position.coords.latitude, position.coords.longitude); },
                (error) => { if(confirm("No se pudo obtener la ubicación. ¿Continuar sin GPS?")) worker.registerLog(null, null); }
            );
        } else {
            worker.registerLog(null, null);
        }
    },

    // Guarda físicamente el nuevo fichaje en la base de datos.
    registerLog: (lat, lng) => {
        const type = worker.isClockedIn ? 'OUT' : 'IN';
        const newLog = {
            id: Date.now(),
            userId: worker.currentUser.id,
            userName: worker.currentUser.name,
            type: type,
            timestamp: new Date().toISOString(),
            lat: lat, lng: lng
        };

        const logs = db.getLogs();
        logs.push(newLog);
        db.saveLogs(logs);

        worker.isClockedIn = !worker.isClockedIn;
        worker.updateUI();
        ui.showToast(`¡${type === 'IN' ? 'Entrada' : 'Salida'} registrada!`);
    },

    // Actualiza los colores y textos del botón según el estado.
    updateUI: () => {
        const btn = document.getElementById('clock-btn');
        const badge = document.getElementById('status-badge');
        
        if (worker.isClockedIn) {
            btn.textContent = "FICHAR SALIDA";
            btn.className = "btn-danger";
            btn.style.boxShadow = "0 10px 15px -3px rgba(239, 68, 68, 0.4)";
            badge.textContent = "Trabajando";
            badge.style.background = "#d1fae5";
            badge.style.color = "#065f46";
        } else {
            btn.textContent = "FICHAR ENTRADA";
            btn.className = "btn-success";
            btn.style.boxShadow = "0 10px 15px -3px rgba(16, 185, 129, 0.4)";
            badge.textContent = "No fichado";
            badge.style.background = "#fee2e2";
            badge.style.color = "#991b1b";
        }
    }
};

// --- LÓGICA DEL ADMINISTRADOR (ADMIN) ---
const admin = {
    currentEditContext: null,

    // Inicializa la vista de administración.
    init: () => {
        admin.renderUserList();
        admin.renderFilterOptions();
        admin.renderTable();
    },

    // Procesa los logs para crear una fila por cada pareja de entrada/salida (sesión)
    processLogsData: () => {
        let logs = db.getLogs();
        const filterMode = document.getElementById('filter-mode').value;
        const filterUser = document.getElementById('filter-user').value;
        
        // Aplica filtros de tiempo (día o mes).
        if (filterMode === 'day') {
            const dateVal = document.getElementById('filter-date').value;
            if (dateVal) logs = logs.filter(l => l.timestamp.startsWith(dateVal));
        } else {
            const monthVal = document.getElementById('filter-month').value;
            if (monthVal) logs = logs.filter(l => l.timestamp.startsWith(monthVal));
        }

        // Filtra por trabajador si no está en "Todos".
        if (filterUser !== 'all') {
            logs = logs.filter(l => l.userId == filterUser);
        }

        // Ordenamos todos los logs por tiempo para emparejarlos correctamente
        logs.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Agrupamos por usuario para no mezclar fichajes de distintas personas
        const userGroups = {};
        logs.forEach(log => {
            if (!userGroups[log.userId]) userGroups[log.userId] = [];
            userGroups[log.userId].push(log);
        });

        const sessions = [];

        // Para cada usuario, buscamos parejas IN -> OUT
        for (const userId in userGroups) {
            const userLogs = userGroups[userId];
            
            for (let i = 0; i < userLogs.length; i++) {
                const log = userLogs[i];
                
                if (log.type === 'IN') {
                    // Hemos encontrado una entrada, buscamos la siguiente salida de este usuario
                    let session = {
                        userId: log.userId,
                        userName: log.userName,
                        dateObj: new Date(log.timestamp),
                        dateStr: new Date(log.timestamp).toLocaleDateString('es-ES'),
                        dateIso: log.timestamp.split('T')[0],
                        entryLog: log,
                        exitLog: null,
                        totalMs: 0
                    };

                    // Buscamos el siguiente registro. Si es un OUT, cerramos la sesión.
                    const nextLog = userLogs[i + 1];
                    if (nextLog && nextLog.type === 'OUT') {
                        session.exitLog = nextLog;
                        session.totalMs = new Date(nextLog.timestamp) - new Date(log.timestamp);
                        i++; // Saltamos el registro OUT porque ya lo hemos procesado
                    }

                    sessions.push(session);
                } else {
                    // Es un OUT sin un IN previo (error de fichaje)
                    sessions.push({
                        userId: log.userId,
                        userName: log.userName,
                        dateObj: new Date(log.timestamp),
                        dateStr: new Date(log.timestamp).toLocaleDateString('es-ES'),
                        dateIso: log.timestamp.split('T')[0],
                        entryLog: null,
                        exitLog: log,
                        totalMs: 0
                    });
                }
            }
        }

        // Formateamos los datos para la tabla
        return sessions.map(s => {
            return {
                userId: s.userId,
                userName: s.userName,
                dateStr: s.dateStr,
                dateIso: s.dateIso,
                entryTime: s.entryLog ? new Date(s.entryLog.timestamp).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'}) : '---',
                exitTime: s.exitLog ? new Date(s.exitLog.timestamp).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'}) : 'Fichado',
                totalMs: s.totalMs,
                totalStr: s.exitLog ? formatDuration(s.totalMs) : 'En curso...',
                latIn: s.entryLog ? s.entryLog.lat : null,
                lngIn: s.entryLog ? s.entryLog.lng : null,
                latOut: s.exitLog ? s.exitLog.lat : null,
                lngOut: s.exitLog ? s.exitLog.lng : null
            };
        }).sort((a,b) => b.dateObj - a.dateObj);
    },

    // Genera el HTML de la tabla de registros basándose en los datos procesados.
    renderTable: () => {
        const data = admin.processLogsData();
        const tbody = document.getElementById('logs-table-body');
        
        tbody.innerHTML = data.map(row => {
            const entryIcon = (row.latIn && row.lngIn) 
                ? `<a href="https://www.google.com/maps/search/?api=1&query=${row.latIn},${row.lngIn}" target="_blank" class="map-link" title="Ver ubicación entrada">📍</a>` 
                : '';
            
            const exitIcon = (row.latOut && row.lngOut) 
                ? `<a href="https://www.google.com/maps/search/?api=1&query=${row.latOut},${row.latOut}" target="_blank" class="map-link" title="Ver ubicación salida">📍</a>` 
                : '';

            return `
                <tr>
                    <td><strong>${row.userName}</strong></td>
                    <td>${row.dateStr}</td>
                    <td>${row.entryTime} ${entryIcon}</td>
                    <td>${row.exitTime} ${exitIcon}</td>
                    <td class="total-cell">${row.totalStr}</td>
                    <td>
                        <button class="icon-btn" onclick="admin.openEditModal(${row.userId}, '${row.dateIso}')" title="Editar Horas">✏️</button>
                        <button class="icon-btn" style="color:var(--danger-color)" onclick="admin.deleteDayLogs(${row.userId}, '${row.dateIso}')" title="Eliminar día completo">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // Muestra la lista de trabajadores en el sidebar para gestión.
    renderUserList: () => {
        const list = document.getElementById('sidebar-user-list');
        const users = db.getUsers().filter(u => u.role !== 'admin');
        list.innerHTML = users.map(u => `
            <div class="user-list-item">
                <span>${u.name}</span>
                <div>
                    <button class="icon-btn" onclick="admin.openEditUserModal(${u.id})" title="Editar trabajador">✏️</button>
                    <button class="icon-btn" style="color:var(--danger-color)" onclick="admin.deleteUser(${u.id})" title="Eliminar">🗑️</button>
                </div>
            </div>
        `).join('');
    },

    // Abre el modal para editar datos de un trabajador.
    openEditUserModal: (id) => {
        const users = db.getUsers();
        const user = users.find(u => u.id === id);
        if(!user) return;

        document.getElementById('edit-user-id').value = user.id;
        document.getElementById('edit-user-name').value = user.name;
        document.getElementById('edit-user-pass').value = user.password;
        document.getElementById('edit-user-modal').classList.add('active');
    },

    // Guarda los cambios realizados en un perfil de trabajador.
    saveUserEdit: () => {
        const id = parseInt(document.getElementById('edit-user-id').value);
        const newName = document.getElementById('edit-user-name').value.trim();
        const newPass = document.getElementById('edit-user-pass').value.trim();

        if(!newName || !newPass) return alert("El nombre y la contraseña no pueden estar vacíos");

        const users = db.getUsers();
        const index = users.findIndex(u => u.id === id);

        if (index !== -1) {
            users[index].name = newName;
            users[index].password = newPass;
            users[index].username = newName.toLowerCase().replace(/\s/g, '');
            
            db.saveUsers(users);
            admin.renderUserList();
            admin.renderFilterOptions();
            ui.closeModal('edit-user-modal');
            ui.showToast("Trabajador actualizado correctamente");
        }
    },

    // Crea un nuevo trabajador en el sistema.
    addUser: () => {
        const name = document.getElementById('new-user-name').value;
        const pass = document.getElementById('new-user-pass').value;
        if (!name || !pass) return alert("Rellena nombre y contraseña");

        const users = db.getUsers();
        users.push({
            id: Date.now(),
            username: name.toLowerCase().replace(/\s/g, ''),
            password: pass,
            name: name,
            role: 'worker'
        });
        db.saveUsers(users);
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-pass').value = '';
        admin.renderUserList();
        admin.renderFilterOptions();
        ui.showToast("Trabajador añadido");
    },

    // Elimina a un trabajador y todos sus datos del localStorage.
    deleteUser: (id) => {
        if(!confirm("¿Eliminar usuario y todos sus registros de fichajes permanentemente?")) return;
        
        const targetId = Number(id);

        // 1. Borrar al usuario de la lista de trabajadores
        let users = db.getUsers();
        users = users.filter(u => Number(u.id) !== targetId);
        db.saveUsers(users);

        // 2. Borrar todos los fichajes asociados a ese ID de usuario
        let logs = db.getLogs();
        logs = logs.filter(l => Number(l.userId) !== targetId);
        db.saveLogs(logs);

        // 3. Refrescar la interfaz completa
        admin.init();
        ui.showToast("Usuario y registros eliminados");
    },

    // Borra todos los fichajes de un día concreto para un usuario.
    deleteDayLogs: (userId, dateIso) => {
        if(!confirm("¿Estás seguro de borrar TODOS los fichajes de este día?")) return;
        let logs = db.getLogs();
        logs = logs.filter(l => !(l.userId === userId && l.timestamp.startsWith(dateIso)));
        db.saveLogs(logs);
        admin.renderTable();
    },

    // Rellena el select del filtro de administrador con los nombres actuales.
    renderFilterOptions: () => {
        const select = document.getElementById('filter-user');
        const users = db.getUsers().filter(u => u.role !== 'admin');
        select.innerHTML = '<option value="all">Todos</option>' + 
            users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    },

    // Abre el modal detallado para ver y editar cada fichaje individual de un día.
    openEditModal: (userId, dateStr) => {
        const user = db.getUsers().find(u => u.id === userId);
        admin.currentEditContext = { userId, dateStr };
        
        document.getElementById('edit-user-display').textContent = `${user.name} - ${dateStr}`;
        
        const allLogs = db.getLogs();
        const dayLogs = allLogs.filter(l => l.userId === userId && l.timestamp.startsWith(dateStr));
        dayLogs.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const listContainer = document.getElementById('edit-logs-list');
        if(dayLogs.length === 0) {
            listContainer.innerHTML = '<div style="color:#888; text-align:center;">No hay registros este día.</div>';
        } else {
            listContainer.innerHTML = dayLogs.map(log => {
                const dateObj = new Date(log.timestamp);
                const offset = dateObj.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(dateObj - offset)).toISOString().slice(0,16);
                
                return `
                    <div class="edit-log-row">
                        <strong style="color:${log.type==='IN'?'var(--success-color)':'var(--danger-color)'}">${log.type}</strong>
                        <input type="datetime-local" value="${localISOTime}" onchange="admin.updateLogTime(${log.id}, this.value)">
                        <button class="icon-btn" style="color:var(--danger-color)" onclick="admin.deleteLog(${log.id})">🗑️</button>
                    </div>
                `;
            }).join('');
        }

        document.getElementById('edit-modal').classList.add('active');
    },

    // Actualiza la fecha/hora de un fichaje específico ya existente.
    updateLogTime: (id, newTimeVal) => {
        if(!newTimeVal) return;
        const newTimestamp = new Date(newTimeVal).toISOString();
        
        let logs = db.getLogs();
        const index = logs.findIndex(l => l.id === id);
        if (index !== -1) {
            logs[index].timestamp = newTimestamp;
            db.saveLogs(logs);
            admin.renderTable();
            ui.showToast("Hora actualizada");
        }
    },

    // Añade un fichaje manual (cuando un empleado se olvidó de fichar).
    addManualLog: () => {
        const timeVal = document.getElementById('new-manual-time').value;
        const type = document.getElementById('new-manual-type').value;
        
        if(!timeVal || !admin.currentEditContext) return alert("Datos incompletos");

        const newTimestamp = new Date(timeVal).toISOString();
        
        // Verificación de seguridad: no dejar añadir un fichaje en un día distinto al que se está editando.
        if(!newTimestamp.startsWith(admin.currentEditContext.dateStr)) {
            alert("La fecha del registro no coincide con el día seleccionado.");
            return;
        }

        const user = db.getUsers().find(u => u.id === admin.currentEditContext.userId);
        const logs = db.getLogs();
        logs.push({
            id: Date.now(),
            userId: user.id,
            userName: user.name,
            type: type,
            timestamp: newTimestamp,
            lat: null,
            lng: null
        });
        
        db.saveLogs(logs);
        admin.openEditModal(admin.currentEditContext.userId, admin.currentEditContext.dateStr);
        admin.renderTable();
        ui.showToast("Registro añadido");
    },

    // Borra un único fichaje (por ejemplo, una entrada duplicada).
    deleteLog: (id) => {
        if(!confirm("¿Borrar este registro individual?")) return;
        let logs = db.getLogs();
        logs = logs.filter(l => l.id !== id);
        db.saveLogs(logs);
        if(admin.currentEditContext) {
            admin.openEditModal(admin.currentEditContext.userId, admin.currentEditContext.dateStr);
        }
        admin.renderTable();
    },

    // Genera un archivo PDF con el informe actual respetando los filtros de trabajador y fecha.
    exportPDF: () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const data = admin.processLogsData();

        if(data.length === 0) { alert("No hay datos para exportar."); return; }

        // Obtenemos el valor del filtro de trabajador
        const filterUserId = document.getElementById('filter-user').value;

        // Obtenemos el nombre del trabajador seleccionado del filtro para el texto
        const filterUserSelect = document.getElementById('filter-user');
        const workerName = filterUserSelect.options[filterUserSelect.selectedIndex].text;
        
        // Obtenemos el mes del filtro
        const monthVal = document.getElementById('filter-month').value || '---';

        // 1. TÍTULO DEL INFORME (Color Naranja) - SUBIDO A 15
        doc.setTextColor(211, 84, 0); 
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        doc.text("INFORME DE JORNADAS", 105, 15, { align: "center" });

        // 2. CABECERA IZQUIERDA Y DERECHA - SUBIDA A 30
        doc.setTextColor(60, 60, 60); 
        doc.setFontSize(11);
        
        let leftCol = 14;
        let rightCol = 130;
        let startY = 30; 

        // Datos Izquierda
        doc.setFont(undefined, 'bold'); doc.text("Empresa:", leftCol, startY);
        doc.setFont(undefined, 'normal'); doc.text("Ecostruct S.L.", leftCol + 20, startY);

        doc.setFont(undefined, 'bold'); doc.text("CIF:", leftCol, startY + 8);
        doc.setFont(undefined, 'normal'); doc.text("B-19343441", leftCol + 10, startY + 8);

        doc.setFont(undefined, 'bold'); doc.text("Centro:", leftCol, startY + 16);
        doc.setFont(undefined, 'normal'); doc.text("Oficina Principal", leftCol + 16, startY + 16);

        // Datos Derecha
        doc.setFont(undefined, 'bold'); doc.text("Empleado:", rightCol, startY);
        doc.setFont(undefined, 'normal'); doc.text(workerName, rightCol + 22, startY);

        doc.setFont(undefined, 'bold'); doc.text("Nº Afiliación:", rightCol, startY + 8);
        doc.setFont(undefined, 'normal'); doc.text("---", rightCol + 26, startY + 8);

        doc.setFont(undefined, 'bold'); doc.text("Mes:", rightCol, startY + 16);
        doc.setFont(undefined, 'normal'); doc.text(monthVal, rightCol + 11, startY + 16);

        // 3. TABLA DE REGISTROS - SUBIDA A 60
        let yPos = 60; 
        
        // Cabecera de la tabla (AZUL OSCURO #080345)
        doc.setFillColor(8, 3, 69); 
        doc.rect(14, yPos, 182, 8, 'F');
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255); 
        
        doc.text("TRABAJADOR", 16, yPos + 6);
        doc.text("FECHA", 60, yPos + 6);
        doc.text("ENTRADA", 100, yPos + 6);
        doc.text("SALIDA", 130, yPos + 6);
        doc.text("DURACIÓN", 165, yPos + 6);

        yPos += 14;

        // Reset de color para el cuerpo de la tabla
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        
        let totalAcumuladoMs = 0; // Para sumar los tiempos

        data.forEach(row => {
            if(yPos > 270) { doc.addPage(); yPos = 20; }
            doc.text(row.userName, 16, yPos);
            doc.text(row.dateStr, 60, yPos);
            doc.text(row.entryTime, 100, yPos);
            doc.text(row.exitTime, 130, yPos);
            doc.text(row.totalStr, 165, yPos);
            
            totalAcumuladoMs += row.totalMs; 
            yPos += 8;
        });

        // 4. SECCIÓN DE RESUMEN Y FIRMAS (SOLO SI NO ES "TODOS")
        if (filterUserId !== 'all') {
            const totalFinalStr = formatDuration(totalAcumuladoMs);
            
            // Verificación de espacio para el pie de página
            if(yPos > 210) { doc.addPage(); yPos = 20; } else { yPos += 15; }

            // Bloque RESUMEN
            doc.setFont(undefined, 'bold');
            doc.text("RESUMEN:", 14, yPos);
            yPos += 8;
            doc.setFont(undefined, 'normal');
            doc.text(`TOTAL TIEMPO TRABAJADO: ${totalFinalStr}`, 14, yPos);
            yPos += 8;
            doc.text(`TIEMPO TOTAL: ${totalFinalStr}`, 14, yPos);

            // Bloque Firmas
            yPos += 30;
            doc.setFont(undefined, 'normal');
            doc.text("Firma empleado:", 14, yPos);
            doc.text("Firma y sello empresa:", 130, yPos);
            
            // Líneas para firmas
            doc.line(14, yPos + 10, 80, yPos + 10); 
            doc.line(130, yPos + 10, 196, yPos + 10); 
        }

        // Nombre de archivo personalizado
        const fileName = `informe_${workerName.replace(/\s/g, '_')}.pdf`;
        doc.save(fileName);
    },

    // Genera un archivo Excel (.xlsx) con los datos procesados respetando el filtro de trabajador.
    exportExcel: () => {
        const data = admin.processLogsData();
        if(data.length === 0) return alert("Sin datos para exportar");

        // Obtenemos el nombre del trabajador seleccionado del filtro
        const filterUserSelect = document.getElementById('filter-user');
        const workerName = filterUserSelect.options[filterUserSelect.selectedIndex].text;

        const exportData = data.map(row => ({
            Trabajador: row.userName,
            Fecha: row.dateStr,
            Entrada: row.entryTime,
            Salida: row.exitTime,
            "Total Trabajado": row.totalStr
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resumen");

        // Nombre de archivo personalizado
        const fileName = `informe_${workerName.replace(/\s/g, '_')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
};

// Función auxiliar para convertir milisegundos en un formato legible (Xh Ym).
function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// --- INTERFAZ DE USUARIO (UI) ---
const ui = {
    // Actualiza el reloj y la fecha en la pantalla principal.
    updateClock: () => {
        const now = new Date();
        const clockEl = document.getElementById('live-clock');
        const dateEl = document.getElementById('live-date');
        if(clockEl) clockEl.textContent = now.toLocaleTimeString('es-ES');
        if(dateEl) dateEl.textContent = now.toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'});
    },

    // Abre o cierra el menú lateral de administración.
    toggleSidebar: () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    },

    // Alterna entre el input de Día o de Mes en los filtros de admin.
    toggleFilterInputs: () => {
        const mode = document.getElementById('filter-mode').value;
        const dayGroup = document.getElementById('filter-day-group');
        const monthGroup = document.getElementById('filter-month-group');

        if(mode === 'day') {
            dayGroup.classList.remove('hidden');
            monthGroup.classList.add('hidden');
        } else {
            dayGroup.classList.add('hidden');
            monthGroup.classList.remove('hidden');
        }
    },

    // Cierra cualquier modal abierto mediante su ID.
    closeModal: (id) => {
        document.getElementById(id).classList.remove('active');
    },

    // Muestra una pequeña notificación temporal en la parte inferior.
    showToast: (msg) => {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    }
};

// Iniciar aplicación al cargar el script.
app.init();