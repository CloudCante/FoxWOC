import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppBar, Toolbar, Typography, Container, Tabs, Tab, Box,
  Paper, TextField, Button, Grid, RadioGroup, FormControlLabel,
  Radio, Divider, Chip, Stack, IconButton, MenuItem, Select,
  InputLabel, FormControl, List, ListItem, ListItemButton,
  ListItemText, Snackbar, Alert, CssBaseline, Switch } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import * as Settings from '../../input/settings.json';

function a11yProps(index) {
  return {
    id: `wo-tab-${index}`,
    'aria-controls': `wo-tabpanel-${index}`,
  };
}

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`wo-tabpanel-${index}`}
      aria-labelledby={`wo-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const shelves = Settings.shelf_count ? Array.from({ length: Settings.shelf_count }, (_, i) => i + 1) : [1, 2, 3, 4];

export default function WorkOrderChecker() {
  // Configuration state
  const todayLocal = useMemo(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const [config, setConfig] = useState({
    partNumber: '',
    date: todayLocal,
    cartNumber: '',
    deliveryNumber: '',
    shelfNumber: 1,
  });

  // Serial tracking state - using arrays to maintain scan order
  const [scannedSerials, setScannedSerials] = useState(() => Array.from({ length: shelves.length }, () => []));

  const [separateSerials, setSeparateSerials] = useState([]);
  const [allScanned, setAllScanned] = useState([]);
  const [approvedSerials, setApprovedSerials] = useState(new Set());

  // UI state
  const [activeTab, setActiveTab] = useState(1); // 0=config, 1=checker, 2=scanned, 3=separate
  const [serialInput, setSerialInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('Ready to scan');
  const [result, setResult] = useState(null); // {text: string, tone: 'success'|'error'}
  const [selectedScanned, setSelectedScanned] = useState(new Set());
  const [selectedSeparate, setSelectedSeparate] = useState(new Set());
  const [moveToShelf, setMoveToShelf] = useState(1);
  const [snack, setSnack] = useState({ open: false, severity: 'info', msg: '' });

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [dups,setDups] = useState(false);

  const inputRef = useRef(null);

  // Add this near the top of the component, after the state declarations
  const audioContextRef = useRef(null);

  // Initialize audio on first user interaction
  useEffect(() => {
    const initAudio = async () => {
      try {
        if (!audioContextRef.current) {
          const Ctor = window.AudioContext || window.webkitAudioContext;
          audioContextRef.current = new Ctor();
        }
        // In case the context is suspended, resume it on the gesture
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      } catch (e) {
        console.warn('Audio init failed:', e);
      }
    };

    const opts = { once: true, passive: true };
    document.addEventListener('pointerdown', initAudio, opts);
    document.addEventListener('keydown', initAudio, opts);
    // Fallback for older browsers
    document.addEventListener('click', initAudio, opts);

    return () => {
      document.removeEventListener('pointerdown', initAudio);
      document.removeEventListener('keydown', initAudio);
      document.removeEventListener('click', initAudio);
    };
  }, []);

  // Optional: throttle to avoid overlapping beeps
  const lastBeepRef = useRef(0);

  const playErrorBeep = async () => {
    if (!audioEnabled) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new Ctor();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      // simple 150ms throttle (optional)
      const nowMs = performance.now();
      if (nowMs - lastBeepRef.current < 150) return;
      lastBeepRef.current = nowMs;

      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // connect graph
      osc.connect(gain);
      gain.connect(ctx.destination);

      // frequency sweep: 800Hz -> 600Hz over 100ms
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.10);

      // amplitude envelope
      // (cancel any previous schedules on this node just in case)
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);              // tiny > 0 to be exp-safe
      gain.gain.linearRampToValueAtTime(0.3, now + 0.01); // quick attack
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.30); // decay

      osc.start(now);
      osc.stop(now + 0.30);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch (error) {
      console.warn('Audio playback failed:', error);
    }
  };


  // Load sample data (in real app, would load from file)
  useEffect(() => {
    (async () => {
        if (window.electronAPI?.loadApprovedSerials) {
        const serials = await window.electronAPI.loadApprovedSerials(); // <-- await
        setApprovedSerials(new Set(serials));                           // <-- Set
        } else {
        console.warn('electronAPI.loadApprovedSerials not found');
        setApprovedSerials(new Set());
        }
    })();
    }, []);


  // Focus input when checker tab is active
  useEffect(() => {
    if (activeTab === 1 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeTab]);

  const normalizeSerial = (s) => s.trim().toUpperCase();

  const checkSerial = (e) => {
    e.preventDefault();
    const serial = normalizeSerial(serialInput);

    if (!serial) {
      setStatusMessage('Please enter a serial number');
      return;
    }

    if (allScanned.includes(serial) && !dups) {
      setSerialInput('');
      setSnack({ open: true, severity: 'info', msg: `Already scanned: ${serial}` });
      return;
    }

    if (serial.length !== Settings.serial_length) {
        setSerialInput('');
        setSnack({ open: true, severity: 'warning', msg: `Invalid serial length: ${serial}` });
        return;
    }

    setAllScanned((prev) => [...prev, serial]);

    if (approvedSerials.has(serial)) {
      playErrorBeep();
      setResult({ text: 'Move aside', subtext: serial, tone: 'error' });
      setStatusMessage(`Serial Number ${serial} is on the list`);
      setSeparateSerials((prev) => [...prev, serial]);
    } else {
      setResult({ text: 'Continue', subtext: serial, tone: 'success' });
      setStatusMessage(`Serial number ${serial} is not on the list`);

      setScannedSerials((prev) => {
        const newScanned = prev.map((arr) => arr.slice());
        const idx = Math.max(0, Math.min(shelves.length - 1, (config.shelfNumber | 0) - 1));
        newScanned[idx].push(serial);
        return newScanned;
      });
    }

    setSerialInput('');
    inputRef.current?.focus();
  };

  const clearAll = () => {
    setSerialInput('');
    setResult(null);
    setStatusMessage('Ready to scan');
    setAllScanned([]);
    setScannedSerials(Array.from({ length: shelves.length }, () => []));
    setSeparateSerials([]);
    setConfig((prev) => ({ ...prev, shelfNumber: 1 }));
    setSelectedScanned(new Set());
    setSelectedSeparate(new Set());
    setSnack({ open: true, severity: 'success', msg: 'Cleared' });
  };

  const toggleScannedSelection = (shelfIdx, serialIdx) => {
    const key = `${shelfIdx}-${serialIdx}`;
    setSelectedScanned((prev) => {
      const copy = new Set(prev);
      copy.has(key) ? copy.delete(key) : copy.add(key);
      return copy;
    });
  };

  const toggleSeparateSelection = (idx) => {
    setSelectedSeparate((prev) => {
      const copy = new Set(prev);
      copy.has(idx) ? copy.delete(idx) : copy.add(idx);
      return copy;
    });
  };

  const removeSelectedScanned = () => {
    const serialsToRemove = [];
    scannedSerials.forEach((shelf, shelfIdx) => {
      shelf.forEach((serial, serialIdx) => {
        if (selectedScanned.has(`${shelfIdx}-${serialIdx}`)) {
          serialsToRemove.push(serial);
        }
      });
    });

    // Remove from scannedSerials
    const newScannedSerials = scannedSerials.map((shelf, shelfIdx) =>
      shelf.filter((_, serialIdx) => !selectedScanned.has(`${shelfIdx}-${serialIdx}`))
    );
    setScannedSerials(newScannedSerials);

    // Remove from allScanned
    setAllScanned((prev) => prev.filter((serial) => !serialsToRemove.includes(serial)));
    
    setSelectedScanned(new Set());
  };

  // safer move logic that avoids duplicates
  const moveSelectedToShelf = () => {
    const selected = Array.from(selectedScanned).map((k) => {
      const [shelfIdx, serialIdx] = k.split('-').map(Number);
      return { shelfIdx, serialIdx };
    });
    if (!selected.length) return;

    const byShelf = new Map();
    for (const { shelfIdx, serialIdx } of selected) {
      if (!byShelf.has(shelfIdx)) byShelf.set(shelfIdx, new Set());
      byShelf.get(shelfIdx).add(serialIdx);
    }

    const toMove = [];
    scannedSerials.forEach((shelf, sIdx) => {
      const marked = byShelf.get(sIdx);
      if (!marked) return;
      shelf.forEach((serial, idx) => {
        if (marked.has(idx)) toMove.push(serial);
      });
    });

    const cleaned = scannedSerials.map((shelf, sIdx) => {
      const marked = byShelf.get(sIdx);
      return marked ? shelf.filter((_, idx) => !marked.has(idx)) : shelf.slice();
    });

    const target = Math.max(0, Math.min(shelves.length - 1, moveToShelf - 1));
    cleaned[target] = [...cleaned[target], ...toMove];

    setScannedSerials(cleaned);
    setSelectedScanned(new Set());
  };

  const removeSelectedSeparate = () => {
    const serialsToRemove = separateSerials.filter((_, idx) => selectedSeparate.has(idx));

    // Remove from separateSerials
    const newSeparateSerials = separateSerials.filter((_, idx) => !selectedSeparate.has(idx));
    setSeparateSerials(newSeparateSerials);

    // Remove from allScanned
    setAllScanned((prev) => prev.filter((serial) => !serialsToRemove.includes(serial)));

    setSelectedSeparate(new Set());
  };

  const exportSerials = async () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    const download = (filename, text) => {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    };

    // Separate CSV
    if (separateSerials.length > 0) {
        const sepRows = [['SN', 'PN'], ...separateSerials.map((sn) => [sn, config.partNumber])];
        const sepCsv = sepRows.map((r) => r.map(String).join(',')).join('\n');

        await download(`separated_serials_${ts}.csv`, sepCsv);
    }
    else{
        setSnack({ open: true, severity: 'info', msg: 'No separated serials to export' });
    }
    try {
        if (!window.electronAPI?.readTemplateFile) {
            console.warn('electronAPI.readTemplateFile not found');
            setSnack({ open: true, severity: 'error', msg: 'Export failed: template not found' });
            return;
        }

        const bytes = await window.electronAPI.readTemplateFile();
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

        // Load + edit with XlsxPopulate (preserves styles, merges, widths, etc.)
        const XlsxPopulateMod = await import('xlsx-populate/browser/xlsx-populate');
        const XlsxPopulate = XlsxPopulateMod.default ?? XlsxPopulateMod;

        const wb = await XlsxPopulate.fromDataAsync(ab);
        const ws = wb.sheet(0); // first sheet

        ws.cell(Settings.pn_loc).value(String(config.partNumber ?? ''));
        ws.cell(Settings.date_loc).value(String(config.date ?? ''));
        ws.cell(Settings.cart_loc).value(String(config.cartNumber ?? ''));
        ws.cell(Settings.dn_loc).value(String(config.deliveryNumber ?? ''));

        const shelfOffsets = Settings?.offsets ?? [7, 35, 64, 92];
        (scannedSerials ?? []).forEach((arr, shelfIdx) => {
            const startRow = shelfOffsets[shelfIdx] ?? shelfOffsets[0];
            (arr ?? []).forEach((sn, i) => {
            ws.cell(`C${startRow + i}`).value(String(sn ?? ''));
            });
        });

        // Export — in browser this is a Blob; in Electron it still works like a Blob
        const blob = await wb.outputAsync();

        // If you added a native Save As… IPC, prefer it:
        if (window.electronAPI?.saveFile) {
            const buf = Buffer.from(await blob.arrayBuffer()); // or new Uint8Array(...)
            const res = await window.electronAPI.saveFile({
            defaultPath: `scanned_serials_${ts}.xlsx`,
            bytes: new Uint8Array(buf),
            });
            if (res?.canceled) {
            setSnack({ open: true, severity: 'info', msg: 'Save canceled' });
            return;
            }
        } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scanned_serials_${ts}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        setSnack({ open: true, severity: 'success', msg: 'Export complete' });
        } catch (err) {
        console.error('Error preparing scanned XLSX (XlsxPopulate):', err);
        setSnack({ open: true, severity: 'error', msg: 'Export failed: error preparing scanned XLSX' });
        }


    //download(`scanned_serials_${ts}.csv`, scCsv);
    setSnack({ open: true, severity: 'success', msg: 'Files exported' });
  };

  const handleReset = () => {
    clearAll();
    setConfig((prev) => ({ ...prev, partNumber: '', cartNumber: '', deliveryNumber: '' }));
    setActiveTab(1);
  }

  const totalScanned = useMemo (() => scannedSerials.reduce((t, arr) => t + arr.length, 0),[scannedSerials]);

  return (
    <>
      <CssBaseline />
      {/* Header */}
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Work Order Checker
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button color="inherit" onClick={() => handleReset()}>Reset</Button>
            <FormControlLabel
              control={
                <Switch
                  checked={audioEnabled}
                  onChange={(e) => setAudioEnabled(e.target.checked)}
                  size="small"
                />
              }
              label="Audio"
              labelPlacement="start"
              sx={{ color: 'inherit' }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={dups}
                  onChange={(e) => setDups(e.target.checked)}
                  size="small"
                />
              }
              label="Duplicates"
              labelPlacement="start"
              sx={{ color: 'inherit' }}
            />
            <Chip label={`Scanned: ${totalScanned}`} color="default" />
            <Chip label={`Separate: ${separateSerials.length}`} color="warning" />
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Paper elevation={2} sx={{ borderRadius: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
          >
            <Tab label="Config" {...a11yProps(0)} />
            <Tab label="Checker" {...a11yProps(1)} />
            <Tab label="Scanned" {...a11yProps(2)} />
            <Tab label="Separated" {...a11yProps(3)} />
          </Tabs>

          {/* Config Tab */}
          <TabPanel value={activeTab} index={0}>
            <Container maxWidth="sm">
              <Grid container spacing={2}>
                <Grid size={{xs:12}}>
                  <TextField
                    fullWidth
                    label="Part Number"
                    value={config.partNumber}
                    onChange={(e) => setConfig({ ...config, partNumber: e.target.value })}
                  />
                </Grid>
                <Grid size ={{ xs:12, sm:6}}>
                  <TextField
                    fullWidth
                    label="Date"
                    type="date"
                    value={config.date}
                    onChange={(e) => setConfig({ ...config, date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size ={{ xs:12, sm:6}}>
                  <TextField
                    fullWidth
                    label="Cart Number"
                    value={config.cartNumber}
                    onChange={(e) => setConfig({ ...config, cartNumber: e.target.value })}
                  />
                </Grid>
                <Grid size ={{ xs:12, sm:6}}>
                  <TextField
                    fullWidth
                    label="Delivery Number"
                    value={config.deliveryNumber}
                    onChange={(e) => setConfig({ ...config, deliveryNumber: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Container>
          </TabPanel>

          {/* Checker Tab */}
          <TabPanel value={activeTab} index={1}>
            <Container maxWidth="lg">
              <Grid container spacing={3}>
                {/* Main scanning area */}
                <Grid size ={{ xs:12, md:8}}>
                  <Box component="form" onSubmit={checkSerial}>
                    <Grid container spacing={2}>
                      <Grid size ={{ xs:12}}>
                        <TextField
                          inputRef={inputRef}
                          fullWidth
                          label="Scan or enter serial number"
                          placeholder="Enter serial number..."
                          value={serialInput}
                          onChange={(e) => setSerialInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && checkSerial(e)}
                          autoFocus
                        />
                      </Grid>
                      <Grid size ={{ xs:12}}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                          Shelf Number
                        </Typography>
                        <RadioGroup
                          row
                          value={config.shelfNumber}
                          onChange={(e) => setConfig({ ...config, shelfNumber: Number(e.target.value) })}
                        >
                          {shelves.map((num) => (
                            <FormControlLabel key={num} value={num} control={<Radio />} label={num} />
                          ))}
                        </RadioGroup>
                      </Grid>
                      <Grid size ={{ xs:12}}>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <Button variant="contained" type="submit">
                            Check
                          </Button>
                          <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={clearAll}>
                            Clear
                          </Button>
                          <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportSerials}>
                            Export Files
                          </Button>
                        </Stack>
                      </Grid>
                    </Grid>
                  </Box>

                  <Box sx={{ textAlign: 'center', my: 3 }}>
                    {result && (
                      <Alert severity={result.tone} variant="outlined" sx={{ display: 'inline-flex', px: 3 }}>
                        <Typography variant="h4" component="div" sx={{ fontWeight: 700, mr: 2 }}>
                          {result.text}
                        </Typography>
                        <Typography variant="h6" component="div" sx={{ opacity: 0.7, mt: 0.5 }}>
                          {result.subtext}
                        </Typography>
                      </Alert>
                    )}
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      {statusMessage}
                    </Typography>
                  </Box>
                </Grid>

                {/* History sidebar */}
                <Grid size ={{ xs:12, md:4}}>
                  <Paper variant="outlined" sx={{ borderRadius: 2, height: '100%', maxHeight: 600 }}>
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Recent Scans
                        </Typography>
                        <Chip size="small" label={allScanned.length} color="primary" />
                      </Stack>
                    </Box>
                    
                    <List dense disablePadding sx={{ maxHeight: 520, overflow: 'auto' }}>
                      {allScanned.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            No scans yet
                          </Typography>
                        </Box>
                      ) : (
                        [...allScanned].reverse().slice(0, 50).map((serial, idx) => {
                          const isInSeparate = separateSerials.includes(serial);
                          const actualIdx = allScanned.length - 1 - idx;
                          
                          return (
                            <ListItem
                              key={`${serial}-${actualIdx}`}
                              divider
                              sx={{
                                bgcolor: isInSeparate ? 'error.50' : 'inherit',
                                '&:hover': { bgcolor: isInSeparate ? 'error.100' : 'action.hover' }
                              }}
                            >
                              <ListItemText
                                primary={
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                    {serial}
                                  </Typography>
                                }
                                secondary={
                                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      #{actualIdx + 1}
                                    </Typography>
                                    {isInSeparate && (
                                      <Chip 
                                        label="Separated" 
                                        size="small" 
                                        color="error" 
                                        sx={{ height: 18, fontSize: '0.65rem' }}
                                      />
                                    )}
                                  </Stack>
                                }
                                secondaryTypographyProps={{ component: 'div' }}
                              />
                            </ListItem>
                          );
                        })
                      )}
                    </List>
                    
                    {allScanned.length > 50 && (
                      <Box sx={{ p: 1, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary">
                          Showing latest 50 of {allScanned.length} scans
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            </Container>
          </TabPanel>

          {/* Scanned Tab */}
          <TabPanel value={activeTab} index={2}>
            <Container maxWidth="lg">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Scanned Serials</Typography>
                <Stack direction="row" spacing={1}>
                  {selectedScanned.size > 0 && (
                    <>
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel id="move-shelf-label">Move to Shelf</InputLabel>
                        <Select
                          labelId="move-shelf-label"
                          value={moveToShelf}
                          label="Move to Shelf"
                          onChange={(e) => setMoveToShelf(Number(e.target.value))}
                        >
                          {shelves.map((num) => (
                            <MenuItem key={num} value={num}>{num}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button variant="contained" onClick={moveSelectedToShelf}>Move</Button>
                      <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={removeSelectedScanned}>
                        Remove Selected ({selectedScanned.size})
                      </Button>
                    </>
                  )}
                  <IconButton color="inherit"><RefreshIcon /></IconButton>
                </Stack>
              </Stack>

              <Grid container spacing={2}>
                {scannedSerials.map((shelfArray, shelfIdx) => (
                  <Grid key={shelfIdx} size ={{ xs:12, sm:6, md:3}}>
                    <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                      <Box sx={{ p: 1.5 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Shelf {shelfIdx + 1}</Typography>
                      </Box>
                      <Divider />
                      <List dense disablePadding sx={{ maxHeight: 360, overflow: 'auto' }}>
                        {shelfArray.map((serial, serialIdx) => {
                          const key = `${shelfIdx}-${serialIdx}`;
                          const isSelected = selectedScanned.has(key);
                          return (
                            <ListItem key={key} disablePadding>
                              <ListItemButton
                                selected={isSelected}
                                onClick={() => toggleScannedSelection(shelfIdx, serialIdx)}
                              >
                                <ListItemText primary={`${serialIdx + 1}. ${serial}`} />
                              </ListItemButton>
                            </ListItem>
                          );
                        })}
                      </List>
                      <Box sx={{ p: 1.5, textAlign: 'right' }}>
                        <Chip size="small" label={`${shelfArray.length} items`} />
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Total: {totalScanned} items
              </Typography>
            </Container>
          </TabPanel>

          {/* Separate Tab */}
          <TabPanel value={activeTab} index={3}>
            <Container maxWidth="md">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="h6">Separate Serials</Typography>
                <Stack direction="row" spacing={1}>
                  {selectedSeparate.size > 0 && (
                    <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={removeSelectedSeparate}>
                      Remove Selected ({selectedSeparate.size})
                    </Button>
                  )}
                  <IconButton color="inherit"><RefreshIcon /></IconButton>
                </Stack>
              </Stack>

              <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                <List dense disablePadding sx={{ maxHeight: 420, overflow: 'auto' }}>
                  {separateSerials.map((serial, idx) => {
                    const isSelected = selectedSeparate.has(idx);
                    return (
                      <ListItem key={idx} disablePadding>
                        <ListItemButton selected={isSelected} onClick={() => toggleSeparateSelection(idx)}>
                          <ListItemText primary={`${idx + 1}. ${serial}`} />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
                <Box sx={{ p: 1.5, textAlign: 'right' }}>
                  <Chip size="small" color="warning" label={`${separateSerials.length} items`} />
                </Box>
              </Paper>
            </Container>
          </TabPanel>
        </Paper>
      </Container>

      <Snackbar
        open={snack.open}
        autoHideDuration={2500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert elevation={6} variant="filled" severity={snack.severity} sx={{ width: '100%' }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
