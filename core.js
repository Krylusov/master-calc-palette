/* Pure calculation module. Round each charged component to kopecks, half up. */
(function (root) {
    'use strict';
    function cents(value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Недопустимая денежная сумма');
        const result = Math.round((value + Number.EPSILON * Math.max(1, value)) * 100);
        if (!Number.isSafeInteger(result)) throw new Error('Денежная сумма слишком велика');
        return result;
    }
    function safe(value) {
        if (!Number.isSafeInteger(value)) throw new Error('Сумма расчёта слишком велика');
        return value;
    }
    function calculateQuote(input) {
        const salary = cents(input.work), rent = cents(input.rent), consumables = cents(input.consumables);
        const matCost = safe(input.materials.reduce((s, value) => safe(s + cents(value)), 0));
        const extraCost = safe(input.extras.reduce((s, value) => safe(s + cents(value)), 0));
        const rates = [input.markupRate, input.taxRate || 0, input.feeRate || 0];
        if (rates.some(r => typeof r !== 'number' || !Number.isFinite(r) || r < 0)) throw new Error('Проверьте проценты');
        const [mark, taxRate, feeRate] = rates;
        if (taxRate + feeRate >= 1) throw new Error('Сумма налога и комиссии должна быть меньше 100%');
        const markup = safe(Math.round(safe(matCost + consumables) * mark));
        const base = safe(salary + rent + consumables + matCost + extraCost + markup);
        let total = safe(input.coverDeductions ? Math.ceil(base / (1 - taxRate - feeRate)) : base);
        let taxCost = safe(Math.round(total * taxRate)), feeCost = safe(Math.round(total * feeRate));
        if (input.coverDeductions && total - taxCost - feeCost < base) {
            // Independently rounding two deductions can add one extra kopeck.
            total = safe(total + Math.ceil((base - (total - taxCost - feeCost) + 1) / (1 - taxRate - feeRate)));
            taxCost = safe(Math.round(total * taxRate)); feeCost = safe(Math.round(total * feeRate));
        }
        const exp = safe(rent + consumables + matCost + extraCost + taxCost + feeCost);
        const profit = safe(total - exp);
        const amounts = {salary, rent, consumables, matCost, extraCost, markup, base, taxCost, feeCost, total, exp, profit};
        return {cents: amounts, ...Object.fromEntries(Object.entries(amounts).map(([key,value]) => [key,value/100]))};
    }
    const api = Object.freeze({cents, calculateQuote});
    root.MasterCalcCore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
