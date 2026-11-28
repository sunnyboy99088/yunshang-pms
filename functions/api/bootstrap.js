import { jsonResp, getAuthenticatedUser } from "../_auth.js";

export async function onRequestGet(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) {
    return jsonResp({ ok: false, error: "未登录或登录已过期" }, 401);
  }

  const db = context.env.DB;
  try {
    const roomsRes = await db.prepare("SELECT * FROM rooms ORDER BY id ASC").all();
    if (!roomsRes.results || roomsRes.results.length === 0) {
      return jsonResp({ ok: true, initialized: false, state: null });
    }

    const [
      cfgRes,
      chRes,
      policeRes,
      ordersRes,
      catsRes,
      perisRes,
      cafeRes,
      incRes,
      logsRes,
      ledgerRes,
      recRes,
      hoRes
    ] = await Promise.all([
      db.prepare("SELECT * FROM system_config").all(),
      db.prepare("SELECT * FROM payment_channels ORDER BY sort_order ASC").all(),
      db.prepare("SELECT * FROM police_web_registry").all(),
      db.prepare("SELECT * FROM online_orders ORDER BY created_at DESC").all(),
      db.prepare("SELECT * FROM peripheral_categories ORDER BY sort_order ASC").all(),
      db.prepare("SELECT * FROM peripherals ORDER BY rowid ASC").all(),
      db.prepare("SELECT * FROM cafe_rentals ORDER BY rent_time DESC").all(),
      db.prepare("SELECT * FROM peripheral_incidents ORDER BY created_time DESC").all(),
      db.prepare("SELECT * FROM peripheral_logs ORDER BY log_time DESC LIMIT 300").all(),
      db.prepare("SELECT * FROM ledger_records ORDER BY biz_date DESC, biz_time DESC").all(),
      db.prepare("SELECT * FROM recovery_orders ORDER BY created_time DESC").all(),
      db.prepare("SELECT * FROM handover_snapshots ORDER BY push_time DESC").all()
    ]);

    const cfgMap = {};
    (cfgRes.results || []).forEach(r => {
      try { cfgMap[r.cfg_key] = JSON.parse(r.cfg_value); } catch (e) { cfgMap[r.cfg_key] = r.cfg_value; }
    });

    const policeWebRegistry = {};
    (policeRes.results || []).forEach(r => {
      policeWebRegistry[r.room_id] = {
        name: r.guest_name,
        idCard: r.id_card,
        phone: r.phone,
        regTime: r.reg_time
      };
    });

    const rooms = (roomsRes.results || []).map(r => ({
      id: r.id,
      type: r.type,
      todayDayPrice: r.today_day_price,
      maxCheckInDays: r.max_check_in_days,
      todayHourPrice: r.today_hour_price,
      defaultDayPrice: r.default_day_price,
      defaultHourPrice: r.default_hour_price,
      otaBottomRef: r.ota_bottom_ref,
      status: r.status,
      pc: {
        cpu: r.pc_cpu,
        gpu: r.pc_gpu,
        monitor: r.pc_monitor,
        ram: r.pc_ram
      },
      stay: r.stay_json ? JSON.parse(r.stay_json) : null
    }));

    // 从数据库 img_data 列完整还原外设图片
    const peripherals = (perisRes.results || []).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      imgUrl: p.img_data || "",
      rentFee: p.rent_fee,
      total: p.total,
      available: p.available,
      repair: p.repair,
      damaged: p.damaged,
      active: Boolean(p.active)
    }));

    const damageList = [];
    const repairItems = [];
    (incRes.results || []).forEach(inc => {
      if (inc.incident_type === "damage") {
        damageList.push({
          id: inc.id,
          periId: inc.peri_id,
          periName: inc.peri_name,
          qty: inc.qty,
          sourceLabel: inc.source_label,
          guestName: inc.guest_name,
          time: inc.created_time,
          operator: inc.operator,
          status: inc.status,
          handleNote: inc.handle_note
        });
      } else {
        repairItems.push({
          id: inc.id,
          periId: inc.peri_id,
          periName: inc.peri_name,
          qty: inc.qty,
          fault: inc.fault,
          contact: inc.contact,
          address: inc.address,
          sendTime: inc.created_time,
          operator: inc.operator
        });
      }
    });

    const peripheralBorrowLogs = [];
    const peripheralStockLogs = [];
    (logsRes.results || []).forEach(lg => {
      if (lg.log_type === "borrow") {
        peripheralBorrowLogs.push({
          id: lg.id,
          time: lg.log_time,
          targetType: lg.target_type,
          targetNo: lg.target_no,
          guestName: lg.guest_name,
          periName: lg.peri_name,
          qty: lg.qty,
          action: lg.action,
          amount: lg.amount,
          operator: lg.operator
        });
      } else {
        peripheralStockLogs.push({
          id: lg.id,
          time: lg.log_time,
          periName: lg.peri_name,
          action: lg.action,
          deltaQty: lg.qty,
          totalAfter: lg.total_after,
          operator: lg.operator
        });
      }
    });

    const assembledState = {
      currentShiftName: cfgMap.currentShiftName || "早班",
      currentCashier: cfgMap.currentCashier || "张悦",
      policeAuto: cfgMap.policeAuto || undefined,
      policeWebRegistry,
      offlineChannels: (chRes.results || [])
        .filter(c => c.channel_type === "offline")
        .map(c => ({ id: c.id, name: c.name, enabled: Boolean(c.enabled) })),
      otaPlatforms: (chRes.results || [])
        .filter(c => c.channel_type === "online")
        .map(c => ({ id: c.id, name: c.name, enabled: Boolean(c.enabled) })),
      peripheralCategories: (catsRes.results || []).map(c => c.name),
      peripherals,
      damageList,
      repairItems,
      cafeRentals: (cafeRes.results || []).map(cf => ({
        id: cf.id,
        guestName: cf.guest_name,
        idCard: cf.id_card,
        phone: cf.phone,
        machineNo: cf.machine_no,
        periId: cf.peri_id,
        periName: cf.peri_name,
        qty: cf.qty,
        rentFee: cf.rent_fee,
        deposit: cf.deposit,
        channel: cf.channel,
        rentTime: cf.rent_time,
        operator: cf.operator
      })),
      peripheralBorrowLogs,
      peripheralStockLogs,
      onlineOrders: (ordersRes.results || []).map(o => ({
        orderNo: o.order_no,
        platform: o.platform,
        guestName: o.guest_name,
        idCard: o.id_card,
        phone: o.phone,
        roomTypeHint: o.room_type_hint,
        days: o.days,
        bottomPrice: o.bottom_price,
        used: Boolean(o.used),
        usedRoom: o.used_room || ""
      })),
      rooms,
      ledger: (ledgerRes.results || []).map(l => ({
        id: l.id,
        date: l.biz_date,
        time: l.biz_time,
        shift: l.shift,
        roomId: l.room_id,
        guestName: l.guest_name,
        payMode: l.pay_mode,
        channel: l.channel,
        bizType: l.biz_type,
        desc: l.description,
        stdFee: l.std_fee,
        fee: l.fee,
        deposit: l.deposit,
        cashier: l.cashier,
        auditStatus: l.audit_status,
        locked: Boolean(l.locked),
        shiftTransfer: l.shift_transfer || ""
      })),
      recoveryOrders: (recRes.results || []).map(r => ({
        id: r.id,
        origLedgerId: r.orig_ledger_id,
        origDesc: r.orig_desc,
        roomId: r.room_id,
        guestName: r.guest_name,
        diffAmount: r.diff_amount,
        reason: r.reason,
        time: r.created_time,
        operator: r.operator
      })),
      handoverSnapshots: (hoRes.results || []).map(h => ({
        id: h.id,
        pushTime: h.push_time,
        date: h.biz_date,
        shift: h.shift,
        cashier: h.cashier,
        offlineNet: h.offline_net,
        onlineTotal: h.online_total,
        depositNet: h.deposit_net,
        roomCount: h.room_count,
        lockedLedgerIds: JSON.parse(h.locked_ledger_ids || "[]"),
        auditStatus: h.audit_status,
        auditor: h.auditor || "",
        auditTime: h.audit_time || "",
        auditNote: h.audit_note || ""
      }))
    };

    return jsonResp({
      ok: true,
      initialized: true,
      version: cfgMap.syncVersion || "1",
      state: assembledState
    });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) {
    return jsonResp({ ok: false, error: "未登录或登录已过期" }, 401);
  }

  const db = context.env.DB;
  try {
    const body = await context.request.json();
    const st = body && body.state;
    if (!st || !Array.isArray(st.rooms)) {
      return jsonResp({ ok: false, error: "无效的业务数据包" }, 400);
    }

    const nowStr = new Date().toISOString();
    const newVersion = String(Date.now());
    const statements = [];

    statements.push(
      db.prepare("INSERT OR REPLACE INTO system_config (cfg_key, cfg_value, updated_at) VALUES (?1, ?2, ?3)")
        .bind("currentShiftName", JSON.stringify(st.currentShiftName || "早班"), nowStr),
      db.prepare("INSERT OR REPLACE INTO system_config (cfg_key, cfg_value, updated_at) VALUES (?1, ?2, ?3)")
        .bind("currentCashier", JSON.stringify(st.currentCashier || "张悦"), nowStr),
      db.prepare("INSERT OR REPLACE INTO system_config (cfg_key, cfg_value, updated_at) VALUES (?1, ?2, ?3)")
        .bind("policeAuto", JSON.stringify(st.policeAuto || {}), nowStr),
      db.prepare("INSERT OR REPLACE INTO system_config (cfg_key, cfg_value, updated_at) VALUES (?1, ?2, ?3)")
        .bind("syncVersion", JSON.stringify(newVersion), nowStr)
    );

    statements.push(db.prepare("DELETE FROM payment_channels"));
    (st.offlineChannels || []).forEach((c, idx) => {
      statements.push(
        db.prepare("INSERT INTO payment_channels (id, channel_type, name, enabled, sort_order) VALUES (?1, 'offline', ?2, ?3, ?4)")
          .bind(c.id, c.name, c.enabled ? 1 : 0, idx)
      );
    });
    (st.otaPlatforms || []).forEach((p, idx) => {
      statements.push(
        db.prepare("INSERT INTO payment_channels (id, channel_type, name, enabled, sort_order) VALUES (?1, 'online', ?2, ?3, ?4)")
          .bind(p.id, p.name, p.enabled ? 1 : 0, idx)
      );
    });

    statements.push(db.prepare("DELETE FROM police_web_registry"));
    Object.entries(st.policeWebRegistry || {}).forEach(([roomId, reg]) => {
      if (reg && reg.name) {
        statements.push(
          db.prepare("INSERT INTO police_web_registry (room_id, guest_name, id_card, phone, reg_time) VALUES (?1, ?2, ?3, ?4, ?5)")
            .bind(roomId, reg.name, reg.idCard || "", reg.phone || "", reg.regTime || "")
        );
      }
    });

    statements.push(db.prepare("DELETE FROM rooms"));
    (st.rooms || []).forEach(r => {
      statements.push(
        db.prepare(`INSERT INTO rooms (
          id, type, today_day_price, max_check_in_days, today_hour_price,
          default_day_price, default_hour_price, ota_bottom_ref, status,
          pc_cpu, pc_gpu, pc_monitor, pc_ram, stay_json, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
          .bind(
            r.id, r.type, r.todayDayPrice, r.maxCheckInDays || 1, r.todayHourPrice,
            r.defaultDayPrice, r.defaultHourPrice, r.otaBottomRef || 0, r.status,
            r.pc?.cpu || "", r.pc?.gpu || "", r.pc?.monitor || "", r.pc?.ram || "",
            r.stay ? JSON.stringify(r.stay) : null, nowStr
          )
      );
    });

    statements.push(db.prepare("DELETE FROM online_orders"));
    (st.onlineOrders || []).forEach(o => {
      statements.push(
        db.prepare(`INSERT INTO online_orders (
          order_no, platform, guest_name, id_card, phone, room_type_hint, days, bottom_price, used, used_room, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
          .bind(o.orderNo, o.platform, o.guestName, o.idCard, o.phone, o.roomTypeHint || "", o.days || 1, o.bottomPrice || 0, o.used ? 1 : 0, o.usedRoom || "", nowStr)
      );
    });

    statements.push(db.prepare("DELETE FROM peripheral_categories"));
    (st.peripheralCategories || []).forEach((cat, idx) => {
      statements.push(
        db.prepare("INSERT INTO peripheral_categories (name, sort_order) VALUES (?1, ?2)")
          .bind(cat, idx)
      );
    });

    // 外设库存台账与外设图片(img_data)一起写入 D1 数据库
    statements.push(db.prepare("DELETE FROM peripherals"));
    (st.peripherals || []).forEach(p => {
      statements.push(
        db.prepare(`INSERT INTO peripherals (
          id, name, category, img_data, rent_fee, total, available, repair, damaged, active, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
          .bind(p.id, p.name, p.category, p.imgUrl || "", p.rentFee || 0, p.total || 0, p.available || 0, p.repair || 0, p.damaged || 0, p.active ? 1 : 0, nowStr)
      );
    });

    statements.push(db.prepare("DELETE FROM cafe_rentals"));
    (st.cafeRentals || []).forEach(cf => {
      statements.push(
        db.prepare(`INSERT INTO cafe_rentals (
          id, guest_name, id_card, phone, machine_no, peri_id, peri_name, qty, rent_fee, deposit, channel, rent_time, operator
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
          .bind(cf.id, cf.guestName, cf.idCard, cf.phone, cf.machineNo, cf.periId, cf.periName, cf.qty, cf.rentFee || 0, cf.deposit || 0, cf.channel, cf.rentTime, cf.operator)
      );
    });

    statements.push(db.prepare("DELETE FROM peripheral_incidents"));
    (st.damageList || []).forEach(d => {
      statements.push(
        db.prepare(`INSERT INTO peripheral_incidents (
          id, incident_type, peri_id, peri_name, qty, source_label, guest_name, fault, contact, address, status, handle_note, created_time, operator
        ) VALUES (?1, 'damage', ?2, ?3, ?4, ?5, ?6, '', '', '', ?7, ?8, ?9, ?10)`)
          .bind(d.id, d.periId, d.periName, d.qty, d.sourceLabel || "", d.guestName || "", d.status || "pending", d.handleNote || "", d.time, d.operator || "")
      );
    });
    (st.repairItems || []).forEach(rp => {
      statements.push(
        db.prepare(`INSERT INTO peripheral_incidents (
          id, incident_type, peri_id, peri_name, qty, source_label, guest_name, fault, contact, address, status, handle_note, created_time, operator
        ) VALUES (?1, 'repair', ?2, ?3, ?4, '', '', ?5, ?6, ?7, 'repairing', '', ?8, ?9)`)
          .bind(rp.id, rp.periId, rp.periName, rp.qty, rp.fault || "", rp.contact || "", rp.address || "", rp.sendTime, rp.operator || "")
      );
    });

    statements.push(db.prepare("DELETE FROM peripheral_logs"));
    (st.peripheralBorrowLogs || []).slice(0, 200).forEach(lg => {
      statements.push(
        db.prepare(`INSERT INTO peripheral_logs (
          id, log_type, log_time, target_type, target_no, guest_name, peri_name, action, qty, total_after, amount, operator
        ) VALUES (?1, 'borrow', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)`)
          .bind(lg.id, lg.time, lg.targetType || "", lg.targetNo || "", lg.guestName || "", lg.periName, lg.action, lg.qty || 0, lg.amount || 0, lg.operator || "")
      );
    });
    (st.peripheralStockLogs || []).slice(0, 200).forEach(lg => {
      statements.push(
        db.prepare(`INSERT INTO peripheral_logs (
          id, log_type, log_time, target_type, target_no, guest_name, peri_name, action, qty, total_after, amount, operator
        ) VALUES (?1, 'stock', ?2, '', '', '', ?3, ?4, ?5, ?6, 0, ?7)`)
          .bind(lg.id, lg.time, lg.periName, lg.action, lg.deltaQty || 0, lg.totalAfter || 0, lg.operator || "")
      );
    });

    statements.push(db.prepare("DELETE FROM ledger_records"));
    (st.ledger || []).forEach(l => {
      statements.push(
        db.prepare(`INSERT INTO ledger_records (
          id, biz_date, biz_time, shift, room_id, guest_name, pay_mode, channel, biz_type, description, std_fee, fee, deposit, cashier, audit_status, locked, shift_transfer
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`)
          .bind(l.id, l.date, l.time, l.shift, l.roomId, l.guestName, l.payMode, l.channel, l.bizType, l.desc, l.stdFee || 0, l.fee || 0, l.deposit || 0, l.cashier, l.auditStatus || "pending", l.locked ? 1 : 0, l.shiftTransfer || "")
      );
    });

    statements.push(db.prepare("DELETE FROM recovery_orders"));
    (st.recoveryOrders || []).forEach(ro => {
      statements.push(
        db.prepare(`INSERT INTO recovery_orders (
          id, orig_ledger_id, orig_desc, room_id, guest_name, diff_amount, reason, created_time, operator
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
          .bind(ro.id, ro.origLedgerId, ro.origDesc, ro.roomId, ro.guestName, ro.diffAmount, ro.reason, ro.time, ro.operator || "")
      );
    });

    statements.push(db.prepare("DELETE FROM handover_snapshots"));
    (st.handoverSnapshots || []).forEach(h => {
      statements.push(
        db.prepare(`INSERT INTO handover_snapshots (
          id, push_time, biz_date, shift, cashier, offline_net, online_total, deposit_net, room_count, locked_ledger_ids, audit_status, auditor, audit_time, audit_note
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
          .bind(h.id, h.pushTime, h.date, h.shift, h.cashier, h.offlineNet || 0, h.onlineTotal || 0, h.depositNet || 0, h.roomCount || 0, JSON.stringify(h.lockedLedgerIds || []), h.auditStatus || "pending", h.auditor || "", h.auditTime || "", h.auditNote || "")
      );
    });

    await db.batch(statements);
    return jsonResp({ ok: true, version: newVersion, updated_at: nowStr });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}
