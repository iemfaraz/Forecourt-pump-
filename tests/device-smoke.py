"""Exercise the normal station workflow in a disposable Chrome profile."""
import base64
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

server = ThreadingHTTPServer(("127.0.0.1", 0), SimpleHTTPRequestHandler)
threading.Thread(target=server.serve_forever, daemon=True).start()
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 15, ignored_exceptions=(StaleElementReferenceException,))

def element(selector):
    return wait.until(lambda d: next((e for e in d.find_elements(By.CSS_SELECTOR, selector) if e.is_displayed()), False))

def fill(selector, value):
    field = element(selector)
    field.clear()
    field.send_keys(value)

def sign_in(username, password):
    fill('#signin [name=login]', username)
    fill('#signin [name=password]', password)
    element('#signin button').click()
    element('#account')

try:
    driver.get(f"http://127.0.0.1:{server.server_port}/")
    password = "local-test-only-password"
    element('#register').click()
    fill('dialog [name=name]', 'Test operator')
    fill('dialog [name=password]', password)
    fill('dialog [name=confirm]', password)
    element('dialog .primary').click()
    element('[data-page="7"]').click()
    element('#manage').click()
    element('#add').click()
    fill('dialog[open] [name=name]', 'Test clerk')
    fill('dialog[open] [name=login]', 'test-clerk')
    fill('dialog[open] [name=password]', password)
    fill('dialog[open] [name=confirm]', password)
    element('dialog[open] .primary').click()
    element('button[data-resetuser]')
    element('#account').click()
    element('#register').click()
    fill('dialog [name=name]', 'Registration test')
    fill('dialog [name=login]', 'new-attendant')
    fill('dialog [name=password]', password)
    fill('dialog [name=confirm]', password)
    element('dialog .primary').click()
    wait.until(lambda d: 'Registration submitted' in element('#signin .err').text)
    fill('#signin [name=login]', 'new-attendant')
    fill('#signin [name=password]', password)
    element('#signin button').click()
    wait.until(lambda d: 'Incorrect' in element('#signin .err').text)
    sign_in('admin', password)
    element('[data-page="8"]').click()
    request = wait.until(lambda d: next((r for r in d.find_elements(By.CSS_SELECTOR,'tbody tr') if 'Pending approval' in r.text), False))
    request.find_element(By.CSS_SELECTOR,'[data-edituser]').click()
    element('dialog .primary').click()
    wait.until(lambda d: 'Account updated for new-attendant' in element('#view').text)
    element('#account').click()
    sign_in('new-attendant', password)
    assert len(driver.find_elements(By.CSS_SELECTOR,'nav button')) == 1
    element('#account').click()
    wait.until(lambda d: d.execute_script('return !!navigator.serviceWorker.controller'))
    driver.execute_cdp_cmd('Network.enable', {})
    driver.execute_cdp_cmd('Network.emulateNetworkConditions', {'offline':True,'latency':0,'downloadThroughput':0,'uploadThroughput':0})
    server.shutdown()
    server.server_close()
    driver.get(f"http://127.0.0.1:{server.server_port}/?release=offline")
    assert 'Working offline' in element('#offlineStatus').text
    sign_in('test-clerk', password)
    assert len(driver.find_elements(By.CSS_SELECTOR,'nav button')) == 1
    with TemporaryDirectory() as temp:
        photo = Path(temp) / 'meter.png'
        image = driver.execute_script("const c=document.createElement('canvas'); c.getContext('2d').fillText('123456 L',5,20);return c.toDataURL().split(',')[1]")
        photo.write_bytes(base64.b64decode(image))
        element('#add').click()
        assert len(driver.find_elements(By.CSS_SELECTOR,'dialog[open] fieldset')) == 4
        element('dialog[open] [data-single]').click()
        driver.execute_script("arguments[0].value='22:30'", element('dialog[open] [name=startTime]'))
        fill('dialog[open] [name=open]', '1000')
        fill('dialog[open] [name=rate]', '350')
        element('dialog[open] [name=photo]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-close]').click()
        fill('dialog[open] [name=close]', '1050')
        assert driver.execute_script('return arguments[0].validity.rangeOverflow', element('dialog[open] [name=close]'))
        fill('dialog[open] [name=close]', '1000')
        assert 'Fuel sold: 0 L' in element('dialog[open] output').text
        fill('dialog[open] [name=close]', '750')
        assert 'Fuel sold: 250 L' in element('dialog[open] output').text
        element('dialog[open] [name=photo]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-stage=closing]')
        assert '87,500' in element('#view table tbody').text
        element('[data-work]').click()
        assert '87,500' in element('.work-record tbody').text
        assert '22:30' in element('.work-record tbody').text
        element('.work-record [data-print]').click()
        printed = driver.execute_script("return document.querySelector('.work-record iframe').contentDocument.body.innerText")
        assert all(v in printed for v in ('Test clerk','test-clerk','22:30','87,500','250'))
        assert 'Meter photos' not in printed
        element('.work-record [data-dismiss]').click()
    assert driver.execute_script("return net({open:100,close:140,returned:2})") == 38
    driver.refresh()
    sign_in('admin', password)
    element('button[data-stage=opening]').click()
    wait.until(lambda d: d.execute_script("return document.querySelector('dialog[open] img')?.naturalWidth>0"))
    element('dialog[open] button').click()
    element('[data-page="8"]').click()
    clerk = lambda: wait.until(lambda d: next((r for r in d.find_elements(By.CSS_SELECTOR,'tbody tr') if 'test-clerk' in r.text), False))
    clerk().find_element(By.CSS_SELECTOR,'[data-work]').click()
    assert '250' in element('.work-record tbody').text
    element('.work-record [data-workphoto][data-stage=closing]').click()
    wait.until(lambda d: d.execute_script("return document.querySelector('dialog[open] img')?.naturalWidth>0"))
    element('dialog[open]:last-of-type button').click()
    element('.work-record [data-dismiss]').click()
    clerk().find_element(By.CSS_SELECTOR,'[data-resetuser]').click()
    newpass = 'changed-station-password'
    fill('dialog[open] [name=password]',newpass)
    fill('dialog[open] [name=confirm]',newpass)
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Password reset for test-clerk' in d.find_element(By.ID,'view').text)
    element('#account').click()
    fill('#signin [name=login]', 'test-clerk')
    fill('#signin [name=password]', password)
    element('#signin button').click()
    wait.until(lambda d: 'Incorrect' in d.find_element(By.CSS_SELECTOR,'#signin .err').text)
    sign_in('test-clerk',newpass)
    element('button[data-stage=closing]')
    element('#account').click()
    sign_in('admin',password)
    element('[data-page="8"]').click()
    clerk().find_element(By.CSS_SELECTOR,'[data-edituser]').click()
    from selenium.webdriver.support.ui import Select
    Select(element('dialog[open] [name=status]')).select_by_value('Disabled')
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Disabled' in clerk().text)
    element('#account').click()
    element('#recoverAdmin').click()
    # Simulate GitHub identity responses without a real account token in CI.
    driver.execute_script("window.fetch=async()=>({ok:true,json:async()=>({id:0})})")
    fill('dialog[open] [name=proof]', 'test-only')
    fill('dialog[open] [name=password]', newpass)
    fill('dialog[open] [name=confirm]', newpass)
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Only the repository owner' in element('dialog[open] .err').text)
    driver.execute_script("window.fetch=async()=>({ok:true,json:async()=>({id:328499199})})")
    element('dialog[open] .primary').click()
    wait.until(lambda d: 'Password reset.' in d.find_element(By.CSS_SELECTOR,'#signin .err').text)
    sign_in('admin',newpass)
    element('button[data-stage=opening]')
    element('[data-page="7"]').click()
    element('#addTank').click()
    fill('#fields [name=name]', 'Reserve petrol')
    fill('#fields [name=opening]', '3000')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('button[data-id="n00"]').click()
    Select(element('#fields [name=tank]')).select_by_visible_text('Reserve petrol')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('[data-page="0"]').click()
    assert '3,000 L' in element('.tanks').text
    element('#add').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'dialog[open] fieldset')) == 4
    Select(element('dialog[open] [name=shift]')).select_by_value('Evening')
    with TemporaryDirectory() as temp:
        photo = Path(temp) / 'meter.png'
        photo.write_bytes(base64.b64decode(image))
        for i in range(4):
            fill(f'[name=litres{i}]', '1000')
            fill(f'[name=rate{i}]', '350')
            element(f'[name=photo{i}]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        element('button[data-close]').click()
        for i in range(4):
            fill(f'[name=litres{i}]', '750')
            element(f'[name=photo{i}]').send_keys(str(photo))
        element('dialog[open] .primary').click()
        wait.until(lambda d: '2,750 L' in element('.tanks').text)
    element('[data-page="1"]').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'#view section > .scroll > table > tbody > tr')) == 2
    group = element('[data-shift-details]').find_element(By.XPATH, '../..')
    assert all(value in group.text for value in ('Evening','4 nozzles','1,000','350,000'))
    element('[data-shift-details]').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'[data-stage=closing]')) == 5
    element('[data-shift-details]').click()
    assert len(driver.find_elements(By.CSS_SELECTOR,'[data-stage=closing]')) == 1
    element('[data-page="0"]').click()
    for period in ['Daily','Weekly','Monthly','Yearly']:
        Select(element('#progressPeriod')).select_by_visible_text(period)
        assert period+' progress report' in element('#progressReport').text
        assert '1,250' in element('#progressReport').text
    Select(element('#progressOwner')).select_by_visible_text('Test operator (admin)')
    for period in ['Daily','Weekly','Monthly','Yearly']:
        Select(element('#progressPeriod')).select_by_visible_text(period)
        group_rows=driver.find_elements(By.CSS_SELECTOR,'#progressReport tbody tr')
        assert len(group_rows)==1
        assert len(group_rows[0].find_elements(By.CSS_SELECTOR,'dl.nozzle-values'))==4
        assert '350,000' in group_rows[0].text and 'Test clerk' not in group_rows[0].text
    element('#progressReport [data-workphoto][data-stage=closing]').click()
    wait.until(lambda d: d.execute_script("return document.querySelector('dialog[open] img')?.naturalWidth>0"))
    element('dialog[open] button').click()
    element('#printProgress').click()
    printed=driver.execute_script("return document.querySelector('#reportFrame').contentDocument.body.innerText")
    assert all(v in printed for v in ('Test operator','Petrol A','Diesel B','350,000'))
    Select(element('#progressOwner')).select_by_value('')
    element('#printProgress').click()
    assert 'Yearly progress report' in driver.execute_script("return document.querySelector('#reportFrame').contentDocument.body.innerText")
    element('#addFuel').click()
    fill('#fields [name=name]', 'Premium petrol')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('#addTank').click()
    fill('#fields [name=name]', 'Premium underground')
    Select(element('#fields [name=fuel]')).select_by_visible_text('Premium petrol')
    fill('#fields [name=opening]', '1500')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    assert 'Premium underground' in element('.tanks').text
    element('[data-page="7"]').click()
    element('#add').click()
    fill('#fields [name=name]', 'Premium C')
    Select(element('#fields [name=fuel]')).select_by_visible_text('Premium petrol')
    Select(element('#fields [name=tank]')).select_by_visible_text('Premium underground')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('[data-page="2"]').click()
    element('#add').click()
    Select(element('#fields [name=fuel]')).select_by_visible_text('Premium petrol')
    Select(element('#fields [name=tank]')).select_by_visible_text('Premium underground')
    fill('#fields [name=company]', 'Premium delivery')
    fill('#fields [name=qty]', '500')
    fill('#fields [name=cost]', '240')
    element('#form .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'#modal[open]')))
    element('[data-page="0"]').click()
    assert '2,000 L' in element('.tanks').text
    element('[data-page="8"]').click()
    operator = wait.until(lambda d: next((row for row in d.find_elements(By.CSS_SELECTOR,'tbody tr') if 'Test operator' in row.text), False))
    operator.find_element(By.CSS_SELECTOR,'[data-work]').click()
    for period in ['Daily','Weekly','Monthly','Yearly']:
        Select(element('.work-record [name=period]')).select_by_visible_text(period)
        records = driver.find_elements(By.CSS_SELECTOR,'.work-record tbody tr')
        assert len(records) == 1
        assert '350,000' in records[0].text
        headings = element('.work-record thead').text
        assert all(name in headings for name in ['Petrol A','Petrol B','Diesel A','Diesel B'])
        assert len(records[0].find_elements(By.CSS_SELECTOR,'dl.nozzle-values')) == 4
    element('.work-record [data-print]').click()
    printed = driver.execute_script("return document.querySelector('.work-record iframe').contentDocument.body.innerText")
    assert all(v in printed for v in ('Yearly','Diesel B','Total sales PKR','350,000'))
    driver.execute_script("arguments[0].value='2000-01-01';arguments[0].dispatchEvent(new Event('change',{bubbles:true}))",element('.work-record [name=anchor]'))
    assert 'No shifts recorded' in element('.work-record [data-results]').text
    Select(element('.work-record [name=period]')).select_by_visible_text('All dates')
    assert '350,000' in element('.work-record tbody').text
    element('.work-record [data-dismiss]').click()
    element('[data-page="7"]').click()
    element('[data-page="4"]').click()
    element('#add').click()
    fill('#fields [name=name]', 'Customer One')
    fill('#fields [name=phone]', '03012345678')
    element('#form .primary').click()
    element('#addCredit').click()
    fill('dialog[open] [name=amount]', '1500')
    element('dialog[open] .primary').click()
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))
    element('#receivePayment').click()
    fill('dialog[open] [name=amount]', '500')
    element('dialog[open] .primary').click()
    wait.until(lambda d:'1,000' in element('#customerStatement').text)
    assert len(driver.find_elements(By.CSS_SELECTOR,'#customerStatement tbody tr'))==2
    element('#whatsAppPdf').click()
    link=element('dialog[open] [data-download]')
    assert link.get_attribute('download').endswith('.pdf')
    assert driver.execute_async_script("const done=arguments[0],f=creditPdfFile('Test',{name:'Test'},'2026-11-27',[]);f.slice(0,8).text().then(s=>done(f.type==='application/pdf'&&s==='%PDF-1.4'),()=>done(false))")
    element('dialog[open] [data-dismiss]').click()
    element('#printCustomer').click()
    assert 'Customer One' in driver.execute_script("return document.querySelector('#reportFrame').contentDocument.body.innerText")
    element('[data-page="7"]').click()
    tank=next(row for row in driver.find_elements(By.CSS_SELECTOR,'tbody tr') if 'Premium underground' in row.text)
    tank.find_element(By.CSS_SELECTOR,'[data-delete-tank]').click()
    driver.switch_to.alert.accept()
    wait.until(lambda d:'Premium underground' not in element('#view').text)
    element('#renameStation').click()
    fill('dialog[open] [name=name]', 'Swat Fuel Station')
    element('dialog[open] .primary').click()
    wait.until(lambda d: element('#stationBrand').text=='Swat Fuel Station')
    element('[data-page="1"]').click()
    element('#add').click()
    Select(element('dialog[open] [name=assignee]')).select_by_visible_text('Registration test (new-attendant)')
    element('dialog[open] [data-single]').click()
    assert 'new-attendant' in Select(element('dialog[open] [name=assignee]')).first_selected_option.text
    element('dialog[open] button.wide').click()
    Select(element('dialog[open] [name=shift]')).select_by_value('Night')
    with TemporaryDirectory() as temp:
        photo=Path(temp)/'meter.png'
        photo.write_bytes(base64.b64decode(image))
        for i in range(5):
            fill(f'[name=litres{i}]','500')
            fill(f'[name=rate{i}]','300')
        element('dialog[open] .primary').click()
        element('button[data-close]').click()
        assert 'Registration test' in element('dialog[open]').text
        for i in range(5):
            fill(f'[name=litres{i}]','400')
        element('dialog[open] .primary').click()
        wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))
    night=next(row for row in driver.find_elements(By.CSS_SELECTOR,'tbody tr') if 'Night' in row.text and 'Registration test' in row.text)
    night.find_element(By.CSS_SELECTOR,'[data-edit-completed]').click()
    fill('dialog[open] [name=close0]', '350')
    element('dialog[open] .primary').click()
    wait.until(lambda d:'165,000' in element('#view').text)
    day=next(row for row in driver.find_elements(By.CSS_SELECTOR,'tbody tr') if 'Test operator' in row.text and '350,000' in row.text)
    shift_id=day.find_element(By.CSS_SELECTOR,'[data-delete-completed]').get_attribute('data-delete-completed')
    day.find_element(By.CSS_SELECTOR,'[data-delete-completed]').click()
    driver.switch_to.alert.dismiss()
    element(f'[data-delete-completed="{shift_id}"]').click()
    driver.switch_to.alert.accept()
    wait.until(lambda d:not d.find_elements(By.CSS_SELECTOR,f'[data-delete-completed="{shift_id}"]'))
    assert '165,000' in element('#view').text
    driver.refresh()
    assert 'Swat Fuel Station' in element('#stationBrand').text
    sign_in('new-attendant',password)
    element('[data-work]').click()
    record=element('.work-record tbody').text
    assert all(value in record for value in ['Night','Test operator','Opened by','Closed by','165,000'])
    assert not driver.find_elements(By.CSS_SELECTOR,'.work-record [data-workphoto]')
    element('.work-record [data-dismiss]').click()
    element('#account').click()
    sign_in('admin',newpass)
    element('[data-page="7"]').click()
    element('#resetStation').click()
    fill('dialog[open] [name=confirmation]', 'RESET')
    element('dialog[open] .primary').click()
    wait.until(lambda d:'Type RESET STATION' in element('dialog[open] .err').text)
    fill('dialog[open] [name=confirmation]', 'RESET STATION')
    element('dialog[open] .primary').click()
    wait.until(lambda d:'Register the first administrator' in element('#access').text)
    assert driver.execute_async_script("""const done=arguments[0],r=indexedDB.open('forecourt-pump-station-device');r.onsuccess=()=>{
      const stores=['users','ledger','photos'],tx=r.result.transaction(stores),counts=[];
      for(const store of stores){const c=tx.objectStore(store).count();c.onsuccess=()=>counts.push(c.result)}
      tx.oncomplete=()=>done(counts.sort())}""")==[0,0,0]
    print("Verified tank stock and all-nozzle shift handover.")
    print("Verified admin setup, staff creation, role navigation, shift handover, persistence and photo retrieval.")
finally:
    driver.quit()
    server.shutdown()
